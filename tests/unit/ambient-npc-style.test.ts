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

  it('keeps single-material primitives scalar and reads the slot off the name', () => {
    // The exporter splits the four-material body into one single-material
    // primitive each, so every mesh sees material index 0 and carries a scalar
    // `material`. Wrapping that scalar in a one-element array makes three.js
    // `projectObject` walk `geometry.groups`, which a single-primitive geometry
    // does not have, so the mesh is dropped from every render list while still
    // reporting `visible: true`. That is what made the whole crowd invisible.
    const root = new THREE.Group();
    const slots = ['cm_pax_skin', 'cm_pax_shirt', 'cm_pax_trousers', 'cm_pax_accent'];
    const meshes = slots.map((name) => {
      const material = new THREE.MeshStandardMaterial();
      material.name = name;
      // PlaneGeometry declares no groups, exactly like an exported primitive.
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.name = name.toUpperCase();
      root.add(mesh);
      return mesh;
    });

    const style = ambientArchetypes[0]!;
    applyAmbientNpcStyle(root, style);

    for (const mesh of meshes) {
      expect(Array.isArray(mesh.material)).toBe(false);
      expect(mesh.geometry.groups.length).toBe(0);
    }
    const colors = meshes.map((mesh) =>
      (mesh.material as THREE.MeshStandardMaterial).color.getHexString(),
    );
    expect(colors).toEqual([
      style.palette.skin.slice(1),
      style.palette.shirt.slice(1),
      style.palette.trousers.slice(1),
      style.palette.hair.slice(1),
    ]);
  });

  it('assigns all authored looks by stable definition order', () => {
    const styles = ambientArchetypes.map((_, index) => ambientArchetypeForIndex(index));
    expect(styles.map((style) => style.id)).toEqual(ambientArchetypes.map((style) => style.id));
  });
});
