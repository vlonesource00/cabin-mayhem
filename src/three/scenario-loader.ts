import * as THREE from 'three';

export const CABIN_SCENARIO_FILE = 'assets/scenarios/cabin-mayhem-scenario.glb';

interface ScenarioLoader {
  loadAsync(url: string): Promise<{ scene: THREE.Group }>;
}

export function scenarioAssetUrl(baseUrl = import.meta.env.BASE_URL): string {
  return `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}${CABIN_SCENARIO_FILE}`;
}

export async function loadCabinScenario(
  loader?: ScenarioLoader,
  baseUrl = import.meta.env.BASE_URL,
): Promise<THREE.Group> {
  const activeLoader =
    loader ?? new (await import('three/examples/jsm/loaders/GLTFLoader.js')).GLTFLoader();
  const gltf = await activeLoader.loadAsync(scenarioAssetUrl(baseUrl));
  const authoredRoot = gltf.scene.getObjectByName('CM_SCENARIO_ROOT');
  if (!authoredRoot) throw new Error('Cabin scenario is missing CM_SCENARIO_ROOT.');
  let meshCount = 0;
  gltf.scene.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh)) return;
    meshCount += 1;
    entry.castShadow = true;
    entry.receiveShadow = true;
  });
  if (meshCount < 4) throw new Error('Cabin scenario contains too few render meshes.');
  gltf.scene.name = 'Production cabin scenario';
  return gltf.scene;
}

export function disposeScenario(root: THREE.Object3D): void {
  root.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh)) return;
    entry.geometry.dispose();
    const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
    for (const material of materials) {
      if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
      material.dispose();
    }
  });
}
