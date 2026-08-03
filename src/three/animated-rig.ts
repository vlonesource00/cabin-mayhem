import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { clipSeconds, isLooping, rigContract, type RigContract } from './animation-contract';

/**
 * Authored-clip playback for the Blender rigs.
 *
 * Presentation only. A rig that fails to load, or a GLB that violates the
 * contract, throws here so the caller can keep the procedural layer in
 * `interaction-animation.ts` instead. No clip choice ever reaches `HostSession`.
 */

interface RigLoader {
  loadAsync(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>;
}

export interface LoadedRig {
  contract: RigContract;
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
}

export function rigAssetUrl(rigId: string, baseUrl = import.meta.env.BASE_URL): string {
  const contract = rigContract(rigId);
  return `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}${contract.runtimeFile}`;
}

export async function loadRig(
  rigId: string,
  loader?: RigLoader,
  baseUrl = import.meta.env.BASE_URL,
): Promise<LoadedRig> {
  const contract = rigContract(rigId);
  const activeLoader =
    loader ?? new (await import('three/examples/jsm/loaders/GLTFLoader.js')).GLTFLoader();
  const gltf = await activeLoader.loadAsync(rigAssetUrl(rigId, baseUrl));

  if (!gltf.scene.getObjectByName(contract.rootNode))
    throw new Error(`Rig ${rigId} is missing ${contract.rootNode}.`);

  const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
  const absent = contract.clips.filter((clip) => !clips.has(clip.name)).map((clip) => clip.name);
  if (absent.length > 0) throw new Error(`Rig ${rigId} is missing clips: ${absent.join(', ')}.`);

  for (const clip of contract.clips) {
    const loaded = clips.get(clip.name);
    if (loaded) loaded.optimize();
  }
  return { contract, scene: gltf.scene, clips };
}

/**
 * Bones an upper-body action layer owns. Everything else stays with the
 * locomotion clip, so a crew member can spray an extinguisher while still
 * walking. `spine` stays lower so the torso follows the legs rather than
 * snapping between two competing sources.
 */
const upperBodyPrefixes = ['chest', 'neck', 'head', 'shoulder', 'upperArm', 'forearm', 'hand'];

/**
 * Whether a bone belongs to the upper-body mask. Takes the bone name rather than
 * a track so the split can be asserted against the contract's bone list without
 * building clips.
 */
export function isUpperBodyBone(bone: string): boolean {
  return upperBodyPrefixes.some((prefix) => bone === prefix || bone.startsWith(prefix));
}

/**
 * Bone a track drives. Parsed with Three.js' own binding parser rather than a
 * split, because bone names here contain dots (`shoulder.L`) and the exporter
 * may emit either `shoulder.L.quaternion` or `.bones[shoulder.L].quaternion`.
 */
const trackBone = (track: THREE.KeyframeTrack): string =>
  THREE.PropertyBinding.parseTrackName(track.name).nodeName ?? '';

const isUpperBody = (track: THREE.KeyframeTrack): boolean => isUpperBodyBone(trackBone(track));

/**
 * Splits a clip into disjoint upper and lower halves.
 *
 * Two actions playing tracks that never overlap can both run at full weight, so
 * this gives true per-bone masking without additive blending — which would fight
 * the absolute poses these clips are authored as.
 */
function maskedClip(clip: THREE.AnimationClip, upper: boolean): THREE.AnimationClip {
  const tracks = clip.tracks.filter((track) => isUpperBody(track) === upper);
  const masked = new THREE.AnimationClip(
    `${clip.name}__${upper ? 'upper' : 'lower'}`,
    clip.duration,
    tracks,
  );
  return masked;
}

export interface ClipRequest {
  /** Looping full-body clip. */
  base: string;
  /** Optional upper-body clip masked over `base`. */
  layer?: string;
}

const defaultFade = 0.18;

/**
 * Drives one skinned instance: a looping base clip, an optional masked
 * upper-body layer, and one-shots that take over until they finish.
 */
export class RigInstance {
  public readonly root: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly contract: RigContract;
  private readonly source: Map<string, THREE.AnimationClip>;
  private readonly masked = new Map<string, THREE.AnimationClip>();

  private base?: THREE.AnimationAction;
  private layer?: THREE.AnimationAction;
  private oneShot?: THREE.AnimationAction;
  private oneShotRemaining = 0;
  private current: ClipRequest = { base: '' };

  public constructor(rig: LoadedRig, root: THREE.Object3D) {
    this.root = root;
    this.contract = rig.contract;
    this.source = rig.clips;
    this.mixer = new THREE.AnimationMixer(root);
  }

  private clip(name: string, mask?: 'upper' | 'lower'): THREE.AnimationClip {
    const clip = this.source.get(name);
    if (!clip) throw new Error(`Clip ${name} is not loaded for rig ${this.contract.id}.`);
    if (!mask) return clip;
    const key = `${name}:${mask}`;
    const cached = this.masked.get(key);
    if (cached) return cached;
    const built = maskedClip(clip, mask === 'upper');
    this.masked.set(key, built);
    return built;
  }

  private action(clip: THREE.AnimationClip, loop: boolean): THREE.AnimationAction {
    const action = this.mixer.clipAction(clip);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    return action;
  }

  /** Switches the looping state. Re-requesting the current state is a no-op. */
  public play(request: ClipRequest, fade = defaultFade): void {
    if (request.base === this.current.base && request.layer === this.current.layer) return;
    const previousBase = this.base;
    const previousLayer = this.layer;

    const masked = request.layer !== undefined;
    const next = this.action(this.clip(request.base, masked ? 'lower' : undefined), true);
    next.reset().setEffectiveWeight(1).play();
    if (previousBase && previousBase !== next) previousBase.crossFadeTo(next, fade, false);
    else next.fadeIn(fade);
    this.base = next;

    if (request.layer !== undefined) {
      const layer = this.action(
        this.clip(request.layer, 'upper'),
        isLooping(this.contract, request.layer),
      );
      layer.reset().setEffectiveWeight(1).play();
      if (previousLayer && previousLayer !== layer) previousLayer.crossFadeTo(layer, fade, false);
      else layer.fadeIn(fade);
      this.layer = layer;
    } else {
      previousLayer?.fadeOut(fade);
      this.layer = undefined;
    }

    this.current = request;
  }

  /**
   * Plays a one-shot over everything else. The looping state underneath keeps
   * running, so when the one-shot releases there is nothing to restore.
   */
  public trigger(name: string, fade = 0.08): void {
    const clip = this.clip(name);
    const action = this.action(clip, false);
    this.oneShot?.fadeOut(fade);
    action.reset().setEffectiveWeight(1).fadeIn(fade).play();
    this.oneShot = action;
    this.oneShotRemaining = clipSeconds(this.contract, name);
  }

  public update(delta: number): void {
    if (this.oneShot) {
      this.oneShotRemaining -= delta;
      if (this.oneShotRemaining <= 0) {
        this.oneShot.fadeOut(defaultFade);
        this.oneShot = undefined;
      }
    }
    this.mixer.update(delta);
  }

  public dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.masked.clear();
  }
}

/**
 * Clones a rig, preserving its skeleton, and shows only `meshName`.
 *
 * Crew and passengers share one skeleton and one GLB, so both meshes come along
 * in the clone; hiding rather than removing the other keeps the skeleton graph
 * identical for every instance. One network fetch covers the whole cabin.
 */
export function instantiate(rig: LoadedRig, meshName: string): RigInstance {
  const source = rig.scene.getObjectByName(rig.contract.rootNode) ?? rig.scene;
  const root = cloneSkeleton(source);
  root.name = `${rig.contract.id}:${meshName}`;
  let matched = false;
  root.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh)) return;
    // A multi-material mesh arrives as `<name>_0`, `<name>_1`, … because glTF
    // splits it into one primitive per material.
    entry.visible = entry.name === meshName || entry.name.startsWith(`${meshName}_`);
    matched ||= entry.visible;
    entry.castShadow = true;
    entry.receiveShadow = true;
    entry.frustumCulled = false;
  });
  if (!matched) throw new Error(`Rig ${rig.contract.id} has no mesh named ${meshName}.`);
  return new RigInstance(rig, root);
}
