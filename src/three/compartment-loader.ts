import * as THREE from 'three';
import {
  BEAM,
  DRAUGHT,
  LOA,
  deckFloorY,
  type CompartmentDefinition,
  type ExteriorDefinition,
} from '../data/ship-layout';

/**
 * Loading one compartment or the ship's exterior, and the greybox that stands
 * in when the GLB is missing or fails validation.
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

/** The exterior's root, and the two mesh groups the X1 tier tells apart. */
export const exteriorRootName = 'CM_SHIP_EXTERIOR_ROOT';
export const exteriorStructurePrefix = 'CM_STRUCTURE_';
export const exteriorDressingPrefix = 'CM_DRESSING_';

export function exteriorAssetUrl(baseUrl = import.meta.env.BASE_URL): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}assets/ship-exterior.glb`;
}

/**
 * The hull and everything bolted to it, as one asset.
 *
 * The structure/dressing split is checked here rather than trusted, because a
 * merge in Blender that lost the prefixes would not fail visibly — the ship
 * would simply cost its full price from inside every cabin on board.
 */
export async function loadExterior(
  definition: ExteriorDefinition,
  loader?: GltfLike,
  baseUrl = import.meta.env.BASE_URL,
): Promise<THREE.Group> {
  const activeLoader =
    loader ?? new (await import('three/examples/jsm/loaders/GLTFLoader.js')).GLTFLoader();
  const gltf = await activeLoader.loadAsync(exteriorAssetUrl(baseUrl));
  const scene = gltf.scene;

  if (!scene.getObjectByName(exteriorRootName)) {
    throw new Error(`The ship exterior is missing ${exteriorRootName}.`);
  }

  let meshCount = 0;
  let structure = 0;
  let dressing = 0;
  scene.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh)) return;
    meshCount += 1;
    if (entry.name.startsWith(exteriorStructurePrefix)) structure += 1;
    if (entry.name.startsWith(exteriorDressingPrefix)) dressing += 1;
    entry.castShadow = true;
    entry.receiveShadow = true;
  });
  if (structure === 0 || dressing === 0) {
    throw new Error(
      `The ship exterior exported ${structure} structure and ${dressing} dressing meshes; ` +
        'the X1 tier needs both.',
    );
  }
  if (meshCount > definition.budget.maxDrawMeshes) {
    throw new Error(
      `The ship exterior exceeds its draw-mesh budget (${meshCount} > ${definition.budget.maxDrawMeshes}).`,
    );
  }

  scene.name = `Exterior ${definition.id}`;
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
const greyboxHull = new THREE.MeshStandardMaterial({ color: 0x2f3a48, roughness: 0.75 });
/** Shared, so `disposeCompartment` must never free them with the geometry. */
const greyboxMaterials = new Set<THREE.Material>([greyboxShell, greyboxDoor, greyboxHull]);

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

/**
 * The exterior's fallback: a hull-shaped slab, the deckhouse on top of it and
 * two funnels. Not a ship, but a vessel-sized silhouette on the water, which is
 * enough to keep the horizon and the sense of scale while the GLB is fixed.
 */
export function buildGreyboxExterior(definition: ExteriorDefinition): THREE.Group {
  const group = new THREE.Group();
  group.name = `Greybox ${definition.id}`;
  const root = new THREE.Group();
  root.name = exteriorRootName;
  group.add(root);

  const sheer = deckFloorY(5);
  const block = (
    name: string,
    size: [number, number, number],
    position: [number, number, number],
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), greyboxHull);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  };

  block(
    `${exteriorStructurePrefix}GREYBOX_HULL`,
    [BEAM, sheer + DRAUGHT, LOA],
    [0, (sheer - DRAUGHT) / 2, 0],
  );
  block(`${exteriorStructurePrefix}GREYBOX_HOUSE`, [BEAM - 4.4, 9.6, 256], [0, sheer + 4.8, 0]);
  block(`${exteriorStructurePrefix}GREYBOX_BRIDGE`, [30, 3.4, 16], [0, 23.3, 96]);
  for (const [index, z] of [-40.5, -28.5].entries()) {
    block(`${exteriorDressingPrefix}GREYBOX_FUNNEL_${index}`, [8.4, 11.6, 9.4], [0, 24.2, z]);
  }

  return group;
}

export function disposeCompartment(root: THREE.Object3D): void {
  root.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh)) return;
    entry.geometry.dispose();
    if (!Array.isArray(entry.material) && greyboxMaterials.has(entry.material)) return;
    const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
    for (const material of materials) {
      if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
      material.dispose();
    }
  });
}
