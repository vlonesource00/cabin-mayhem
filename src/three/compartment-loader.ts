import * as THREE from 'three';
import type { CompartmentDefinition } from '../data/ship-layout';

/**
 * Loading one compartment, and the greybox that stands in when the GLB is
 * missing or fails validation.
 *
 * The loader is deliberately non-authoritative. Nothing here can change the
 * simulation: it either produces the authored room or produces a box of the
 * same dimensions with the same doorways, and the voyage runs either way.
 */

export interface GltfLike {
  loadAsync(url: string): Promise<{ scene: THREE.Group }>;
}

export function compartmentRootName(id: string): string {
  return `CM_${id.toUpperCase().replace(/-/g, '_')}_ROOT`;
}

export function portalMarkerName(target: string): string {
  return `CM_PORTAL_${target.toUpperCase().replace(/-/g, '_')}`;
}

export function compartmentAssetUrl(id: string, baseUrl = import.meta.env.BASE_URL): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}assets/compartments/${id}.glb`;
}

export async function loadCompartment(
  definition: CompartmentDefinition,
  loader?: GltfLike,
  baseUrl = import.meta.env.BASE_URL,
): Promise<THREE.Group> {
  const activeLoader =
    loader ?? new (await import('three/examples/jsm/loaders/GLTFLoader.js')).GLTFLoader();
  const gltf = await activeLoader.loadAsync(compartmentAssetUrl(definition.id, baseUrl));
  const scene = gltf.scene;

  const rootName = compartmentRootName(definition.id);
  if (!scene.getObjectByName(rootName)) {
    throw new Error(`Compartment ${definition.id} is missing ${rootName}.`);
  }
  for (const portal of definition.portals) {
    const marker = portalMarkerName(portal.target);
    if (!scene.getObjectByName(marker)) {
      throw new Error(`Compartment ${definition.id} is missing ${marker}.`);
    }
  }

  let meshCount = 0;
  scene.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh)) return;
    meshCount += 1;
    entry.castShadow = true;
    entry.receiveShadow = true;
  });
  if (meshCount < 4) {
    throw new Error(`Compartment ${definition.id} contains too few render meshes.`);
  }
  if (meshCount > definition.budget.maxDrawMeshes) {
    throw new Error(
      `Compartment ${definition.id} exceeds its draw-mesh budget (${meshCount} > ${definition.budget.maxDrawMeshes}).`,
    );
  }

  scene.name = `Compartment ${definition.id}`;
  return scene;
}

const greyboxShell = new THREE.MeshStandardMaterial({
  color: 0x5b6672,
  roughness: 0.85,
  side: THREE.DoubleSide,
});
const greyboxDoor = new THREE.MeshStandardMaterial({
  color: 0xf0a63c,
  roughness: 0.6,
  emissive: 0x4a2f00,
});

/**
 * The fallback. Same dimensions, same doorways, no dressing: enough to stand
 * in, walk through and finish the voyage while the authored GLB is fixed.
 */
export function buildGreyboxCompartment(definition: CompartmentDefinition): THREE.Group {
  const group = new THREE.Group();
  group.name = `Greybox ${definition.id}`;
  const { x: width, y: height, z: length } = definition.size;

  const panel = (
    name: string,
    size: [number, number, number],
    position: [number, number, number],
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), greyboxShell);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  panel('greybox deck', [width, 0.12, length], [0, -0.06, 0]);
  panel('greybox deckhead', [width, 0.12, length], [0, height + 0.06, 0]);
  panel('greybox port', [0.12, height, length], [-width / 2, height / 2, 0]);
  panel('greybox starboard', [0.12, height, length], [width / 2, height / 2, 0]);
  panel('greybox aft', [width, height, 0.12], [0, height / 2, -length / 2]);
  panel('greybox fore', [width, height, 0.12], [0, height / 2, length / 2]);

  for (const portal of definition.portals) {
    const marker = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.1, 0.2), greyboxDoor);
    marker.name = portalMarkerName(portal.target);
    marker.position.set(portal.position.x, 1.05, portal.position.z);
    group.add(marker);
  }

  return group;
}

export function disposeCompartment(root: THREE.Object3D): void {
  root.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh)) return;
    entry.geometry.dispose();
    if (entry.material === greyboxShell || entry.material === greyboxDoor) return;
    const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
    for (const material of materials) {
      if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
      material.dispose();
    }
  });
}
