import * as THREE from 'three';
import { ambientArchetypes, type AmbientArchetype } from '../data/ambient-crowd';

const ownedMaterialsKey = 'ambientOwnedMaterials';
const ownedGeometriesKey = 'ambientOwnedGeometries';

/** Stable string hash. Guest ids are host-stable, so style never flickers. */
export function ambientStableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1)
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

export function ambientArchetypeFor(residentId: string): AmbientArchetype {
  return ambientArchetypes[ambientStableHash(residentId) % ambientArchetypes.length]!;
}

function ownedMaterials(root: THREE.Object3D): THREE.Material[] {
  const materials = root.userData[ownedMaterialsKey];
  if (Array.isArray(materials)) return materials as THREE.Material[];
  const created: THREE.Material[] = [];
  root.userData[ownedMaterialsKey] = created;
  return created;
}

function ownedGeometries(root: THREE.Object3D): THREE.BufferGeometry[] {
  const geometries = root.userData[ownedGeometriesKey];
  if (Array.isArray(geometries)) return geometries as THREE.BufferGeometry[];
  const created: THREE.BufferGeometry[] = [];
  root.userData[ownedGeometriesKey] = created;
  return created;
}

function addAccessoryMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  root: THREE.Object3D,
): void {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  ownedGeometries(root).push(geometry);
}

function addHair(root: THREE.Object3D, style: AmbientArchetype, material: THREE.Material): void {
  const head = root.getObjectByName('head');
  if (!head) return;

  if (style.hair === 'cap') {
    addAccessoryMesh(
      head,
      new THREE.CylinderGeometry(0.28, 0.31, 0.08, 8),
      material,
      'ambient cap crown',
      root,
    );
    const crown = head.getObjectByName('ambient cap crown');
    crown?.position.set(0, 0.22, 0.01);
    crown?.rotation.set(0, 0, 0);
    return;
  }

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), material);
  hair.name = 'ambient hair';
  hair.castShadow = true;
  hair.receiveShadow = true;
  hair.position.set(0, style.hair === 'bob' ? 0.1 : 0.18, 0.02);
  hair.scale.set(
    style.hair === 'bob' ? 1.08 : 0.94,
    style.hair === 'bob' ? 0.62 : 0.4,
    style.hair === 'bob' ? 1.02 : 0.94,
  );
  head.add(hair);
  ownedGeometries(root).push(hair.geometry);

  if (style.hair === 'bun') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), material);
    bun.name = 'ambient hair bun';
    bun.castShadow = true;
    bun.position.set(0, 0.29, 0.06);
    head.add(bun);
    ownedGeometries(root).push(bun.geometry);
  }
}

function addAccessory(
  root: THREE.Object3D,
  style: AmbientArchetype,
  material: THREE.Material,
): void {
  const head = root.getObjectByName('head');
  if (!head || style.accessory === 'none') return;

  if (style.accessory === 'sunglasses') {
    const glasses = new THREE.BoxGeometry(0.43, 0.055, 0.035);
    addAccessoryMesh(head, glasses, material, 'ambient sunglasses', root);
    head.getObjectByName('ambient sunglasses')?.position.set(0, 0.095, -0.235);
    return;
  }

  if (style.accessory === 'visor') {
    const visor = new THREE.BoxGeometry(0.48, 0.045, 0.18);
    addAccessoryMesh(head, visor, material, 'ambient visor', root);
    head.getObjectByName('ambient visor')?.position.set(0, 0.19, -0.09);
    return;
  }

  const earbuds = new THREE.SphereGeometry(0.045, 8, 6);
  addAccessoryMesh(head, earbuds, material, 'ambient earbuds', root);
  const mesh = head.getObjectByName('ambient earbuds');
  mesh?.position.set(0.22, 0.035, -0.015);
  const other = mesh?.clone();
  if (other) {
    other.name = 'ambient earbuds pair';
    other.position.x = -0.22;
    head.add(other);
  }
}

function materialColorForSlot(style: AmbientArchetype, index: number): string {
  if (index === 0) return style.palette.skin;
  if (index === 1) return style.palette.shirt;
  if (index === 2) return style.palette.trousers;
  return style.palette.hair;
}

/**
 * Applies low-cost per-instance variation to the cloned CM_PASSENGER mesh.
 * Geometry remains GLB-backed; only small hair/accessory primitives are added
 * as presentation details and are disposed with the instance.
 */
export function applyAmbientNpcStyle(root: THREE.Object3D, style: AmbientArchetype): void {
  if (root.userData.ambientStyleId === style.id) return;
  root.userData.ambientStyleId = style.id;
  root.userData.ambientArchetype = style.id;
  root.scale.set(style.silhouette.width, style.silhouette.height, style.silhouette.depth);

  const materials = ownedMaterials(root);
  root.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh) || !entry.visible) return;
    const source = Array.isArray(entry.material) ? entry.material : [entry.material];
    entry.material = source.map((material, index) => {
      const clone = material.clone();
      if (clone instanceof THREE.MeshStandardMaterial) {
        clone.color.set(materialColorForSlot(style, index));
        clone.roughness =
          index === 0 ? Math.min(0.9, style.finish.roughness + 0.08) : style.finish.roughness;
        clone.metalness = style.finish.metalness;
        clone.needsUpdate = true;
      }
      materials.push(clone);
      return clone;
    });
  });

  const hairMaterial = new THREE.MeshStandardMaterial({
    color: style.palette.hair,
    roughness: style.finish.roughness,
    metalness: style.finish.metalness,
  });
  materials.push(hairMaterial);
  addHair(root, style, hairMaterial);

  const accessoryMaterial = new THREE.MeshStandardMaterial({
    color: style.palette.accessory,
    roughness: Math.max(0.35, style.finish.roughness - 0.12),
    metalness: Math.min(0.2, style.finish.metalness + 0.04),
  });
  materials.push(accessoryMaterial);
  addAccessory(root, style, accessoryMaterial);
}

/** Releases only materials and geometry created by applyAmbientNpcStyle. */
export function disposeAmbientNpcStyle(root: THREE.Object3D): void {
  const details: THREE.Object3D[] = [];
  root.traverse((entry) => {
    if (entry.name.startsWith('ambient ')) details.push(entry);
  });
  for (const detail of details) detail.parent?.remove(detail);

  const materials = root.userData[ownedMaterialsKey];
  if (Array.isArray(materials))
    for (const material of materials as THREE.Material[]) material.dispose();
  const geometries = root.userData[ownedGeometriesKey];
  if (Array.isArray(geometries))
    for (const geometry of geometries as THREE.BufferGeometry[]) geometry.dispose();
  delete root.userData[ownedMaterialsKey];
  delete root.userData[ownedGeometriesKey];
  delete root.userData.ambientStyleId;
  delete root.userData.ambientArchetype;
}
