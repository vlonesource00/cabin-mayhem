import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ambientArchetypes } from '../../src/data/ambient-crowd';
import {
  ambientArchetypeForIndex,
  applyAmbientNpcStyle,
  disposeAmbientNpcStyle,
} from '../../src/three/ambient-npc-style';

describe('ambient NPC style presentation', () => {
  it('recolors GLB material slots without attaching procedural head geometry', () => {
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
    expect(root.getObjectByName('head')).toBeTruthy();
    expect(root.getObjectByName('ambient hair')).toBeUndefined();
    expect(root.getObjectByName('ambient sunglasses')).toBeUndefined();

    disposeAmbientNpcStyle(root);

    expect(root.getObjectByName('ambient hair')).toBeUndefined();
    expect(root.getObjectByName('ambient sunglasses')).toBeUndefined();
    expect(root.getObjectByName('head')).toBeTruthy();
    expect(root.userData.ambientArchetype).toBeUndefined();
  });

  it('assigns all authored looks by stable definition order', () => {
    const styles = ambientArchetypes.map((_, index) => ambientArchetypeForIndex(index));
    expect(styles.map((style) => style.id)).toEqual(ambientArchetypes.map((style) => style.id));
  });
});
