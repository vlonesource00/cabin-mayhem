import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ambientArchetypes } from '../../src/data/ambient-crowd';
import { applyAmbientNpcStyle, disposeAmbientNpcStyle } from '../../src/three/ambient-npc-style';

describe('ambient NPC style presentation', () => {
  it('recolors the GLB material slots and owns removable style details', () => {
    const root = new THREE.Group();
    const head = new THREE.Bone();
    head.name = 'head';
    root.add(head);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [
      new THREE.MeshStandardMaterial(),
      new THREE.MeshStandardMaterial(),
      new THREE.MeshStandardMaterial(),
      new THREE.MeshStandardMaterial(),
    ]);
    root.add(mesh);

    const style = ambientArchetypes.find((candidate) => candidate.accessory === 'sunglasses')!;
    applyAmbientNpcStyle(root, style);

    const materials = mesh.material as THREE.MeshStandardMaterial[];
    expect(root.scale.toArray()).toEqual([
      style.silhouette.width,
      style.silhouette.height,
      style.silhouette.depth,
    ]);
    expect(materials[0]!.color.getHexString()).toBe(style.palette.skin.slice(1));
    expect(materials[1]!.color.getHexString()).toBe(style.palette.shirt.slice(1));
    expect(root.getObjectByName('ambient hair')).toBeTruthy();
    expect(root.getObjectByName('ambient sunglasses')).toBeTruthy();

    disposeAmbientNpcStyle(root);

    expect(root.getObjectByName('ambient hair')).toBeUndefined();
    expect(root.getObjectByName('ambient sunglasses')).toBeUndefined();
    expect(root.userData.ambientArchetype).toBeUndefined();
  });
});
