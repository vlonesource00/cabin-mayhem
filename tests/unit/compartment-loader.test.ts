import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { compartmentById } from '../../src/data/ship-layout';
import {
  buildGreyboxCompartment,
  compartmentAssetUrl,
  compartmentRootName,
  loadCompartment,
  portalMarkerName,
  type GltfLike,
} from '../../src/three/compartment-loader';

const atrium = compartmentById('atrium')!;

/** A scene that satisfies the compartment contract, minus whatever is removed. */
const authoredScene = (options: { root?: boolean; portals?: boolean; meshes?: number } = {}) => {
  const scene = new THREE.Group();
  const root = new THREE.Group();
  root.name = options.root === false ? 'Scene' : compartmentRootName(atrium.id);
  scene.add(root);
  if (options.portals !== false) {
    for (const portal of atrium.portals) {
      const marker = new THREE.Object3D();
      marker.name = portalMarkerName(portal.target);
      root.add(marker);
    }
  }
  for (let index = 0; index < (options.meshes ?? 6); index += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.name = `CM_MATERIAL_${index}`;
    root.add(mesh);
  }
  return scene;
};

const loaderFor = (scene: THREE.Group): GltfLike & { requested: string[] } => {
  const requested: string[] = [];
  return {
    requested,
    loadAsync: async (url: string) => {
      requested.push(url);
      return { scene };
    },
  };
};

describe('compartmentAssetUrl', () => {
  it('resolves under any base path', () => {
    expect(compartmentAssetUrl('atrium', '/cabin-mayhem/')).toBe(
      '/cabin-mayhem/assets/compartments/atrium.glb',
    );
    expect(compartmentAssetUrl('engine-room', '/')).toBe('/assets/compartments/engine-room.glb');
  });
});

describe('loadCompartment', () => {
  it('accepts an authored compartment and enables shadows', async () => {
    const loader = loaderFor(authoredScene());
    const scene = await loadCompartment(atrium, loader, '/game/');
    expect(loader.requested).toEqual(['/game/assets/compartments/atrium.glb']);
    let meshes = 0;
    scene.traverse((entry) => {
      if (entry instanceof THREE.Mesh) {
        meshes += 1;
        expect(entry.castShadow).toBe(true);
      }
    });
    expect(meshes).toBe(6);
  });

  it('rejects a GLB with no compartment root', async () => {
    await expect(
      loadCompartment(atrium, loaderFor(authoredScene({ root: false })), '/'),
    ).rejects.toThrow(compartmentRootName(atrium.id));
  });

  it('rejects a GLB missing a declared portal', async () => {
    await expect(
      loadCompartment(atrium, loaderFor(authoredScene({ portals: false })), '/'),
    ).rejects.toThrow('CM_PORTAL_');
  });

  it('rejects a GLB that blows the draw-mesh budget', async () => {
    await expect(
      loadCompartment(
        atrium,
        loaderFor(authoredScene({ meshes: atrium.budget.maxDrawMeshes + 1 })),
        '/',
      ),
    ).rejects.toThrow('draw-mesh budget');
  });
});

describe('buildGreyboxCompartment', () => {
  it('stands in with the same dimensions and the same doorways', () => {
    const group = buildGreyboxCompartment(atrium);
    const names = group.children.map((child) => child.name);
    for (const portal of atrium.portals) {
      expect(names).toContain(portalMarkerName(portal.target));
    }
    const deck = group.getObjectByName('greybox deck') as THREE.Mesh;
    const size = new THREE.Box3().setFromObject(deck).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(atrium.size.x, 6);
    expect(size.z).toBeCloseTo(atrium.size.z, 6);
  });
});
