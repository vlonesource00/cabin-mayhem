import { readFile, stat } from 'node:fs/promises';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { inspectGlb } from '../../scripts/glb-inspect';
import { createNavigationIncidentState } from '../../src/sim/navigation-incident';
import {
  navigationObstacleAssetPath,
  navigationObstacleAssetUrl,
  navigationObstacleRootName,
  NavigationObstaclePresenter,
} from '../../src/three/navigation-obstacle-presenter';

const obstacle = createNavigationIncidentState().obstacle;

describe('authored navigation obstacle presentation', () => {
  it('catalogues a Blender source and a non-empty GLB with the runtime root', async () => {
    const manifest = JSON.parse(await readFile('public/assets/manifest.json', 'utf8')) as {
      assets: Array<{ id: string; sourceFile: string; runtimeFile: string }>;
    };
    const entry = manifest.assets.find(
      (asset) => asset.id === 'cabin-mayhem-navigation-obstacle-vessel',
    );
    expect(entry).toMatchObject({
      id: 'cabin-mayhem-navigation-obstacle-vessel',
      sourceFile: 'assets-src/blender/navigation-obstacle-vessel.blend',
      runtimeFile: `public/${navigationObstacleAssetPath}`,
    });
    const sourceInfo = await stat(entry!.sourceFile);
    const runtimeInfo = await stat(entry!.runtimeFile);
    expect(sourceInfo.isFile()).toBe(true);
    expect(runtimeInfo.isFile()).toBe(true);

    const glb = await inspectGlb(entry!.runtimeFile);
    expect(glb.bytes).toBeGreaterThan(1000);
    expect(glb.nodeNames).toContain(navigationObstacleRootName);
    expect(glb.meshNames.length).toBeGreaterThanOrEqual(4);
    expect(glb.meshNames.some((name) => name.includes('NAVIGATION_VESSEL_HULL'))).toBe(true);
  });

  it('uses the GLB loader as the vessel production path and exposes the asset URL', async () => {
    const scene = new THREE.Group();
    const root = new THREE.Group();
    root.name = navigationObstacleRootName;
    scene.add(root);
    for (let index = 0; index < 4; index += 1) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
      mesh.name = `authored mesh ${index}`;
      root.add(mesh);
    }
    const loader = { loadAsync: vi.fn().mockResolvedValue({ scene }) };
    const presenter = new NavigationObstaclePresenter({ baseUrl: '/cabin/', loader });
    presenter.sync(obstacle, 'warning', 0.5);

    await expect(presenter.ready()).resolves.toBe('glb');
    expect(loader.loadAsync).toHaveBeenCalledWith(`/cabin/${navigationObstacleAssetPath}`);
    expect(navigationObstacleAssetUrl('/cabin')).toBe(`/cabin/${navigationObstacleAssetPath}`);
    expect(presenter.assetSource).toBe('glb');
    expect(
      presenter.group.children.find((child) => child.userData.obstacleModel)?.userData.assetSource,
    ).toBe('glb');
  });

  it('only selects procedural geometry after an explicit GLB failure', async () => {
    const loader = { loadAsync: vi.fn().mockRejectedValue(new Error('test load failure')) };
    const presenter = new NavigationObstaclePresenter({ loader });
    presenter.sync(obstacle, 'warning', 0.5);

    await expect(presenter.ready()).resolves.toBe('procedural-fallback');
    expect(presenter.group.userData.fallbackReason).toBe('test load failure');
    expect(
      presenter.group.children.find((child) => child.userData.obstacleModel)?.userData.assetSource,
    ).toBe('procedural-fallback');
  });
});
