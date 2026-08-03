import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { isUpperBodyBone, loadRig, rigAssetUrl } from '../../src/three/animated-rig';
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
