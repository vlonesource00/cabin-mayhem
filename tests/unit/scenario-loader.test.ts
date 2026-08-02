import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { loadCabinScenario, scenarioAssetUrl } from '../../src/three/scenario-loader';

describe('production cabin scenario loader', () => {
  it('resolves under the configured deployment base', () => {
    expect(scenarioAssetUrl('/cabin-mayhem/')).toBe(
      '/cabin-mayhem/assets/scenarios/cabin-mayhem-scenario.glb',
    );
    expect(scenarioAssetUrl('/')).toBe('/assets/scenarios/cabin-mayhem-scenario.glb');
  });

  it('prepares a valid authored scene', async () => {
    const scene = new THREE.Group();
    const root = new THREE.Group();
    root.name = 'CM_SCENARIO_ROOT';
    scene.add(root);
    for (let index = 0; index < 4; index += 1)
      root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    const loader = { loadAsync: vi.fn().mockResolvedValue({ scene }) };

    const result = await loadCabinScenario(loader, '/game/');
    expect(loader.loadAsync).toHaveBeenCalledWith(
      '/game/assets/scenarios/cabin-mayhem-scenario.glb',
    );
    expect(result.name).toBe('Production cabin scenario');
    expect((root.children[0] as THREE.Mesh).castShadow).toBe(true);
  });

  it('rejects malformed authored scenes so procedural fallback stays active', async () => {
    const loader = { loadAsync: vi.fn().mockResolvedValue({ scene: new THREE.Group() }) };
    await expect(loadCabinScenario(loader, '/')).rejects.toThrow('CM_SCENARIO_ROOT');
  });
});
