import * as THREE from 'three';
import { ambientArchetypes, type AmbientArchetype } from '../data/ambient-crowd';

const ownedMaterialsKey = 'ambientOwnedMaterials';

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

/** Selects a stable authored look by definition order for fixed service guests. */
export function ambientArchetypeForIndex(index: number): AmbientArchetype {
  const normalized = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return ambientArchetypes[normalized % ambientArchetypes.length]!;
}

function ownedMaterials(root: THREE.Object3D): THREE.Material[] {
  const materials = root.userData[ownedMaterialsKey];
  if (Array.isArray(materials)) return materials as THREE.Material[];
  const created: THREE.Material[] = [];
  root.userData[ownedMaterialsKey] = created;
  return created;
}

function materialColorForSlot(style: AmbientArchetype, index: number): string {
  if (index === 0) return style.palette.skin;
  if (index === 1) return style.palette.shirt;
  if (index === 2) return style.palette.trousers;
  return style.palette.hair;
}

/**
 * Applies low-cost per-instance variation to the cloned CM_PASSENGER mesh.
 * Geometry remains GLB-backed; presentation variation is limited to stable
 * material and silhouette changes so unknown GLB bones cannot create blobs.
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
  delete root.userData[ownedMaterialsKey];
  delete root.userData.ambientStyleId;
  delete root.userData.ambientArchetype;
}
