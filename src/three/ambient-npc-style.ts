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

const paletteSlotOrder = ['skin', 'shirt', 'trousers', 'hair'] as const;

type PaletteSlot = (typeof paletteSlotOrder)[number];

/**
 * glTF splits a four-material mesh into one single-material primitive each, so
 * the slot cannot be read off the array index — every primitive arrives as
 * index 0. The authored material names carry the slot instead.
 */
function paletteSlotFor(material: THREE.Material, index: number): PaletteSlot {
  const name = material.name.toLowerCase();
  if (name.includes('skin')) return 'skin';
  if (name.includes('shirt') || name.includes('uniform')) return 'shirt';
  if (name.includes('trousers') || name.includes('trim')) return 'trousers';
  if (name.includes('accent') || name.includes('hair')) return 'hair';
  return paletteSlotOrder[Math.min(index, paletteSlotOrder.length - 1)]!;
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
    const wasArray = Array.isArray(entry.material);
    const source = wasArray ? (entry.material as THREE.Material[]) : [entry.material];
    const cloned = source.map((material, index) => {
      const clone = material.clone();
      if (clone instanceof THREE.MeshStandardMaterial) {
        const slot = paletteSlotFor(material, index);
        clone.color.set(style.palette[slot]);
        clone.roughness =
          slot === 'skin' ? Math.min(0.9, style.finish.roughness + 0.08) : style.finish.roughness;
        clone.metalness = style.finish.metalness;
        clone.needsUpdate = true;
      }
      materials.push(clone);
      return clone;
    });
    // A single-material mesh must keep a single material. Handing three.js a
    // one-element array makes `projectObject` walk `geometry.groups`, which a
    // one-primitive glTF mesh does not have, so the mesh is silently dropped
    // from every render list while still reporting visible.
    entry.material = wasArray ? cloned : cloned[0]!;
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
