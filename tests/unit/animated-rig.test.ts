import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { instantiate, isUpperBodyBone, loadRig, rigAssetUrl } from '../../src/three/animated-rig';
import { characterRigId, rigContract } from '../../src/three/animation-contract';

const characters = rigContract(characterRigId);

/**
 * A stand-in GLB. The runtime only ever asks the loader for a scene containing
 * the root node plus named clips, so a hand-built scene exercises the contract
 * checks without shipping a fixture binary into the test suite.
 */
const fakeGltf = (options: { root?: string; clips?: string[] } = {}) => {
  const scene = new THREE.Group();
  const root = new THREE.Object3D();
  root.name = options.root ?? characters.rootNode;
  scene.add(root);
  const names = options.clips ?? characters.clips.map((clip) => clip.name);
  const animations = names.map(
    (name) =>
      new THREE.AnimationClip(name, 1, [
        new THREE.VectorKeyframeTrack('hips.position', [0, 1], [0, 0, 0, 0, 0, 0]),
      ]),
  );
  return { scene, animations };
};

const loader = (gltf: ReturnType<typeof fakeGltf>) => ({
  loadAsync: async () => gltf,
});

describe('rigAssetUrl', () => {
  it('joins the base URL and the contract path exactly once', () => {
    expect(rigAssetUrl(characterRigId, '/cabin-mayhem/')).toBe(
      `/cabin-mayhem/${characters.runtimeFile}`,
    );
    expect(rigAssetUrl(characterRigId, '/cabin-mayhem')).toBe(
      `/cabin-mayhem/${characters.runtimeFile}`,
    );
  });

  it('rejects an unknown rig id', () => {
    expect(() => rigAssetUrl('not-a-rig')).toThrow(/Unknown rig contract/);
  });
});

describe('loadRig', () => {
  it('returns every declared clip when the GLB matches the contract', async () => {
    const rig = await loadRig(characterRigId, loader(fakeGltf()), '/');
    expect(rig.clips.size).toBe(characters.clips.length);
    expect(rig.contract.id).toBe(characterRigId);
  });

  it('rejects a GLB missing the root node', async () => {
    await expect(loadRig(characterRigId, loader(fakeGltf({ root: 'WRONG' })), '/')).rejects.toThrow(
      /missing CM_CHARACTER_ROOT/,
    );
  });

  it('names the clips a GLB is missing so the fallback failure is diagnosable', async () => {
    const partial = characters.clips.map((clip) => clip.name).filter((name) => name !== 'spray');
    await expect(
      loadRig(characterRigId, loader(fakeGltf({ clips: partial })), '/'),
    ).rejects.toThrow(/missing clips: spray/);
  });
});

describe('upper-body mask', () => {
  it('partitions the humanoid skeleton into two non-empty disjoint halves', () => {
    const upper = characters.bones.filter(isUpperBodyBone);
    const lower = characters.bones.filter((bone) => !isUpperBodyBone(bone));
    expect(upper.length + lower.length).toBe(characters.bones.length);
    expect(upper.length).toBeGreaterThan(0);
    expect(lower.length).toBeGreaterThan(0);
  });

  it('keeps hips and spine with the legs so the torso follows locomotion', () => {
    expect(isUpperBodyBone('hips')).toBe(false);
    expect(isUpperBodyBone('spine')).toBe(false);
    for (const bone of ['thigh.L', 'shin.R', 'foot.L']) expect(isUpperBodyBone(bone)).toBe(false);
  });

  it('claims the arms, chest and head for the action layer', () => {
    for (const bone of ['chest', 'neck', 'head', 'shoulder.L', 'upperArm.R', 'forearm.L', 'hand.R'])
      expect(isUpperBodyBone(bone)).toBe(true);
  });
});

describe('shipped seated character animation', () => {
  it('contains non-empty neutral loops and anatomically valid seated legs at multiple phases', async () => {
    const gltf = await shippedCharacterGltf();
    const rig = await loadRig(characterRigId, { loadAsync: async () => gltf }, '/');
    const seatedLoops = characters.clips.filter(
      (clip) => clip.name.startsWith('seat_') && clip.loop,
    );
    expect(seatedLoops.map((clip) => clip.name)).toEqual(
      expect.arrayContaining(['seat_idle', 'seat_chat', 'seat_look', 'seat_relaxed']),
    );
    const passenger = instantiate(rig, 'CM_PASSENGER');

    for (const contractClip of seatedLoops) {
      const clip = gltf.animations.find((candidate) => candidate.name === contractClip.name);
      expect(clip, `${contractClip.name} shipped`).toBeDefined();
      expect(clip?.duration, `${contractClip.name} duration`).toBeGreaterThan(0);
      expect(clip?.tracks.length, `${contractClip.name} tracks`).toBeGreaterThan(0);
      passenger.play({ base: contractClip.name }, 0);

      for (const phase of [0, 0.2, 0.47, 0.83]) {
        passenger.seekPhase(phase);
        passenger.root.updateMatrixWorld(true);
        const hips = bonePosition(passenger.root, 'hips');
        const kneeL = bonePosition(passenger.root, 'shinL');
        const ankleL = bonePosition(passenger.root, 'footL');
        const kneeR = bonePosition(passenger.root, 'shinR');
        const ankleR = bonePosition(passenger.root, 'footR');
        const thighL = kneeL.clone().sub(hips);
        const shinL = ankleL.clone().sub(kneeL);
        const thighR = kneeR.clone().sub(hips);
        const shinR = ankleR.clone().sub(kneeR);

        for (const [thigh, shin] of [
          ['left', [thighL, shinL]],
          ['right', [thighR, shinR]],
        ] as const) {
          const [upper, lower] = shin;
          expect(
            upper.length(),
            `${contractClip.name} ${phase} ${thigh} thigh length`,
          ).toBeGreaterThan(0.25);
          expect(upper.z, `${contractClip.name} ${phase} ${thigh} thigh forward`).toBeLessThan(
            -0.2,
          );
          expect(upper.y, `${contractClip.name} ${phase} ${thigh} thigh direction`).toBeLessThan(
            0.02,
          );
          expect(
            lower.length(),
            `${contractClip.name} ${phase} ${thigh} shin length`,
          ).toBeGreaterThan(0.25);
          expect(lower.y, `${contractClip.name} ${phase} ${thigh} shin down`).toBeLessThan(-0.2);
          expect(
            Math.abs(lower.z),
            `${contractClip.name} ${phase} ${thigh} shin not back`,
          ).toBeLessThan(0.18);
        }

        expect(kneeL.x).toBeGreaterThan(0);
        expect(kneeR.x).toBeLessThan(0);
        expect(ankleL.x).toBeGreaterThan(0);
        expect(ankleR.x).toBeLessThan(0);
        expect(Math.abs(ankleL.x - kneeL.x)).toBeLessThan(0.08);
        expect(Math.abs(ankleR.x - kneeR.x)).toBeLessThan(0.08);
        expect(ankleL.y).toBeGreaterThan(0.2);
        expect(ankleL.y).toBeLessThan(0.55);
        expect(ankleR.y).toBeGreaterThan(0.2);
        expect(ankleR.y).toBeLessThan(0.55);
      }
    }
    passenger.dispose();
  });

  it('seeks a shipped neutral passenger to distinct phases', async () => {
    const gltf = await shippedCharacterGltf();
    const rig = await loadRig(characterRigId, { loadAsync: async () => gltf }, '/');
    const passenger = instantiate(rig, 'CM_PASSENGER');
    const head = passenger.root.getObjectByName('head');
    if (!(head instanceof THREE.Object3D)) throw new Error('Shipped head bone missing');
    passenger.play({ base: 'seat_chat' }, 0);
    passenger.seekPhase(0.08);
    passenger.root.updateMatrixWorld(true);
    const first = head.getWorldQuaternion(new THREE.Quaternion());
    passenger.seekPhase(0.58);
    passenger.root.updateMatrixWorld(true);
    const second = head.getWorldQuaternion(new THREE.Quaternion());
    expect(Math.abs(first.dot(second))).toBeLessThan(0.99999);
    passenger.dispose();
  });
});

async function shippedCharacterGltf(): Promise<{
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}> {
  const assetPath = fileURLToPath(
    new URL('../../public/assets/characters/cabin-mayhem-characters.glb', import.meta.url),
  );
  const bytes = await readFile(assetPath);
  const binary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(binary, assetPath, resolve, reject);
  });
}

function bonePosition(root: THREE.Object3D, canonicalName: string): THREE.Vector3 {
  let bone: THREE.Object3D | undefined;
  const normalized = canonicalName.replace(/[._]/g, '').toLowerCase();
  root.traverse((entry) => {
    if (!bone && entry.name.replace(/[._]/g, '').toLowerCase() === normalized) bone = entry;
  });
  if (!bone) throw new Error(`Missing shipped bone ${canonicalName}`);
  return bone.getWorldPosition(new THREE.Vector3());
}
