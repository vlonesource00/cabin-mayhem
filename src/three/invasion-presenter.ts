import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { boardingInvasionDefinition, type InvasionAssetId } from '../data/invasions';
import type {
  BoardingInvasionPhase,
  BoardingInvasionState,
  BoardingLinkId,
  BoardingLinkStatus,
} from '../sim/types';
import { cabinToWorld } from './coordinates';

export type InvasionAssetSource = 'loading' | 'glb' | 'partial-fallback';

export interface InvasionGltfLike {
  loadAsync(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>;
}

export interface InvasionPresenterOptions {
  baseUrl?: string;
  loader?: InvasionGltfLike;
}

interface LoadedInvasionAsset {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
}

interface AnimatedInstance {
  root: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  action?: THREE.AnimationAction;
  actionName?: string;
}

const visiblePhases = new Set<BoardingInvasionPhase>(['approach', 'boarders-aboard', 'failed']);

export function invasionAssetUrl(path: string, baseUrl = import.meta.env.BASE_URL): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${path.replace(/^\//, '')}`;
}

/**
 * Snapshot-driven visual layer for a boarding incident.
 *
 * HostSession remains the only authority for phase, hostile count, boarding-link
 * status, score and damage. This class only turns those values into authored GLB
 * instances and AnimationMixer actions. Deterministic staging is intentional:
 * clients receiving the same snapshot see the same boarders in the same places.
 */
export class InvasionPresenter {
  public readonly group = new THREE.Group();
  private readonly loader: InvasionGltfLike;
  private readonly baseUrl: string;
  private readonly assets = new Map<InvasionAssetId, LoadedInvasionAsset>();
  private readonly failures = new Map<InvasionAssetId, string>();
  private readonly links = new Map<BoardingLinkId, AnimatedInstance>();
  private readonly hostiles: AnimatedInstance[] = [];
  private crate?: AnimatedInstance;
  private currentState?: BoardingInvasionState;
  private currentOrigin = '';
  private lastElapsed?: number;
  private readonly readyPromise: Promise<InvasionAssetSource>;
  private _assetSource: InvasionAssetSource = 'loading';

  public constructor(options: InvasionPresenterOptions = {}) {
    this.loader = options.loader ?? new GLTFLoader();
    this.baseUrl = options.baseUrl ?? import.meta.env.BASE_URL;
    this.group.name = 'host-authoritative boarding invasion';
    this.group.userData.feedback = 'boarding-invasion';
    this.group.userData.assetSource = this._assetSource;
    this.group.visible = false;
    this.readyPromise = this.loadAssets();
  }

  public get assetSource(): InvasionAssetSource {
    return this._assetSource;
  }

  public get failedAssetIds(): InvasionAssetId[] {
    return [...this.failures.keys()];
  }

  public ready(): Promise<InvasionAssetSource> {
    return this.readyPromise;
  }

  public sync(state: BoardingInvasionState, originCompartmentId: string, elapsed: number): void {
    const delta = Math.max(0, Math.min(elapsed - (this.lastElapsed ?? elapsed), 0.05));
    this.lastElapsed = elapsed;
    this.currentState = state;
    this.currentOrigin = originCompartmentId;
    this.group.visible = visiblePhases.has(state.phase);
    this.group.userData.phase = state.phase;
    this.group.userData.hostileCount = state.hostileCount;
    if (this._assetSource === 'loading') return;

    this.syncLinks(state, originCompartmentId, elapsed);
    this.syncHostiles(state, originCompartmentId, elapsed);
    this.syncCrate(state, originCompartmentId);
    for (const instance of [...this.links.values(), ...this.hostiles])
      instance.mixer?.update(delta);
    this.crate?.mixer?.update(delta);
  }

  public dispose(): void {
    for (const instance of [...this.links.values(), ...this.hostiles])
      instance.mixer?.stopAllAction();
    this.crate?.mixer?.stopAllAction();
    this.links.clear();
    this.hostiles.length = 0;
    this.assets.clear();
  }

  private async loadAssets(): Promise<InvasionAssetSource> {
    await Promise.all(
      boardingInvasionDefinition.assets.map(async (definition) => {
        try {
          const gltf = await this.loader.loadAsync(invasionAssetUrl(definition.path, this.baseUrl));
          for (const node of definition.requiredNodes)
            if (!gltf.scene.getObjectByName(node))
              throw new Error(`${definition.id} is missing required node ${node}`);
          const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
          for (const action of definition.requiredActions)
            if (!clips.has(action))
              throw new Error(`${definition.id} is missing required action ${action}`);
          gltf.scene.traverse((entry) => {
            if (!(entry instanceof THREE.Mesh)) return;
            entry.castShadow = true;
            entry.receiveShadow = true;
            entry.frustumCulled = false;
          });
          this.assets.set(definition.id, { scene: gltf.scene, clips });
        } catch (error) {
          this.failures.set(definition.id, error instanceof Error ? error.message : String(error));
        }
      }),
    );
    this._assetSource = this.failures.size === 0 ? 'glb' : 'partial-fallback';
    this.group.userData.assetSource = this._assetSource;
    this.group.userData.failedAssetIds = this.failedAssetIds;
    if (this.currentState) this.sync(this.currentState, this.currentOrigin, this.lastElapsed ?? 0);
    return this._assetSource;
  }

  private syncLinks(
    state: BoardingInvasionState,
    originCompartmentId: string,
    elapsed: number,
  ): void {
    for (const definition of boardingInvasionDefinition.links) {
      const link = state.links[definition.id];
      if (!link) continue;
      const instance =
        this.links.get(definition.id) ?? this.createInstance(definition.assetId, 'boarding-link');
      if (!this.links.has(definition.id)) {
        instance.root.name = `invasion link ${definition.id}`;
        instance.root.userData.linkId = definition.id;
        this.links.set(definition.id, instance);
        this.group.add(instance.root);
      }
      instance.root.visible = state.phase !== 'warning' && state.phase !== 'idle';
      instance.root.position.copy(
        cabinToWorld(link.position, 0.04, link.compartmentId, originCompartmentId),
      );
      instance.root.rotation.y =
        definition.id === 'port-boarding-board' ? Math.PI / 2 : -Math.PI / 2;
      instance.root.userData.status = link.status;
      this.play(instance, linkAction(link.status, state.phase, definition.kind));
      if (link.status === 'approaching')
        instance.root.position.y += 0.12 + Math.sin(elapsed * 5) * 0.06;
    }
  }

  private syncHostiles(
    state: BoardingInvasionState,
    originCompartmentId: string,
    elapsed: number,
  ): void {
    const wanted =
      state.phase === 'approach'
        ? Math.min(2, boardingInvasionDefinition.initialHostileCount)
        : state.phase === 'boarders-aboard' || state.phase === 'failed'
          ? state.hostileCount
          : 0;
    const presentation = boardingInvasionDefinition.enemyPresentations.find(
      (entry) => entry.kind === state.enemyKind,
    );
    if (!presentation) return;

    while (this.hostiles.length < wanted) {
      const index = this.hostiles.length;
      const instance = this.createInstance(presentation.characterAssetId, 'character');
      instance.root.name = `invasion ${state.enemyKind} ${index + 1}`;
      instance.root.userData.enemyKind = state.enemyKind;
      instance.root.userData.hostileIndex = index;
      this.attachLoadout(instance.root, presentation.loadoutAssetIds, index);
      this.hostiles.push(instance);
      this.group.add(instance.root);
    }

    for (const [index, instance] of this.hostiles.entries()) {
      instance.root.visible = index < wanted;
      if (!instance.root.visible) continue;
      const link =
        boardingInvasionDefinition.links[index % boardingInvasionDefinition.links.length]!;
      const column = Math.floor(index / boardingInvasionDefinition.links.length);
      const inward = link.id === 'port-boarding-board' ? 1 : -1;
      const point = {
        x: link.position.x + inward * (1.7 + (column % 2) * 1.35),
        y: link.position.y - 3.2 - Math.floor(column / 2) * 1.8,
      };
      instance.root.position.copy(cabinToWorld(point, 0, link.compartmentId, originCompartmentId));
      instance.root.rotation.y = Math.PI + inward * 0.2;
      instance.root.userData.authoritativeHostileCount = state.hostileCount;
      const action = hostileAction(state.phase, state.enemyKind, index, elapsed);
      this.play(instance, action);
    }
  }

  private syncCrate(state: BoardingInvasionState, originCompartmentId: string): void {
    if (!this.crate) {
      this.crate = this.createInstance('pirate-gear-crate', 'prop');
      this.crate.root.name = 'invasion pirate gear crate';
      this.group.add(this.crate.root);
    }
    const visible = state.phase === 'boarders-aboard' || state.phase === 'failed';
    this.crate.root.visible = visible;
    if (!visible) return;
    const link = boardingInvasionDefinition.links[0]!;
    this.crate.root.position.copy(
      cabinToWorld(
        { x: link.position.x + 3.5, y: link.position.y - 1.25 },
        0,
        link.compartmentId,
        originCompartmentId,
      ),
    );
    this.crate.root.rotation.y = 0.18;
    this.play(this.crate, 'Open');
  }

  private createInstance(assetId: InvasionAssetId, role: string): AnimatedInstance {
    const asset = this.assets.get(assetId);
    if (!asset) return this.fallbackInstance(assetId, role);
    const root = cloneSkeleton(asset.scene);
    root.userData.assetId = assetId;
    root.userData.assetSource = 'glb';
    return {
      root,
      mixer: asset.clips.size > 0 ? new THREE.AnimationMixer(root) : undefined,
      clips: asset.clips,
    };
  }

  private fallbackInstance(assetId: InvasionAssetId, role: string): AnimatedInstance {
    const root = new THREE.Group();
    root.userData.assetId = assetId;
    root.userData.assetSource = 'procedural-fallback';
    const material = new THREE.MeshStandardMaterial({
      color: role === 'character' ? 0xff4e86 : 0xffcf4f,
      emissive: role === 'character' ? 0x5d102d : 0x5a3b00,
      roughness: 0.55,
    });
    const mesh = new THREE.Mesh(
      role === 'character'
        ? new THREE.CapsuleGeometry(0.34, 1.05, 5, 10)
        : new THREE.BoxGeometry(1.2, 0.25, 2.2),
      material,
    );
    mesh.position.y = role === 'character' ? 0.86 : 0.14;
    root.add(mesh);
    return { root, clips: new Map() };
  }

  private attachLoadout(
    character: THREE.Object3D,
    loadout: InvasionAssetId[],
    hostileIndex: number,
  ): void {
    const chosen = loadout[hostileIndex % loadout.length];
    if (!chosen || chosen === 'pirate-gear-crate') return;
    const asset = this.assets.get(chosen);
    if (!asset) return;
    const socketName = chosen === 'satchel-charge' ? 'explosive_socket' : 'weapon_socket_r';
    const socket = character.getObjectByName(socketName);
    if (!socket) return;
    const equipment = asset.scene.clone(true);
    equipment.name = `${chosen} equipped`;
    equipment.userData.assetId = chosen;
    equipment.position.set(0, 0, 0);
    equipment.rotation.set(0, 0, 0);
    socket.add(equipment);
  }

  private play(instance: AnimatedInstance, actionName: string): void {
    if (!instance.mixer || instance.actionName === actionName) return;
    const clip = instance.clips.get(actionName);
    if (!clip) return;
    const previous = instance.action;
    const action = instance.mixer.clipAction(clip);
    const oneShot = ['Attach', 'Detach', 'Release', 'Board', 'HitReact', 'Fall'].includes(
      actionName,
    );
    action.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
    action.clampWhenFinished = oneShot;
    action.reset().setEffectiveWeight(1).fadeIn(0.12).play();
    previous?.fadeOut(0.12);
    instance.action = action;
    instance.actionName = actionName;
    instance.root.userData.action = actionName;
  }
}

function linkAction(
  status: BoardingLinkStatus,
  phase: BoardingInvasionPhase,
  kind: 'boarding-board' | 'gangway',
): string {
  if (status === 'detached') return kind === 'gangway' ? 'Release' : 'Detach';
  if (status === 'attached') return 'Attach';
  return phase === 'approach' ? 'Approach' : 'Detached';
}

function hostileAction(
  phase: BoardingInvasionPhase,
  enemyKind: BoardingInvasionState['enemyKind'],
  index: number,
  elapsed: number,
): string {
  if (phase === 'approach') return 'Board';
  if (phase === 'failed')
    return index % 2 === 0 ? 'Aim' : enemyKind === 'bomber' ? 'ArmExplosive' : 'Melee';
  if (elapsed < 1.4) return 'Run';
  if (enemyKind === 'bomber') return index % 2 === 0 ? 'PlantExplosive' : 'Aim';
  return index % 3 === 0 ? 'Aim' : index % 3 === 1 ? 'Melee' : 'Idle';
}
