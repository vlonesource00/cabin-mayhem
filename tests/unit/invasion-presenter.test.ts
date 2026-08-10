import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { boardingInvasionDefinition } from '../../src/data/invasions';
import { createBoardingInvasionState } from '../../src/sim/boarding-invasion';
import type { BoardingInvasionState } from '../../src/sim/types';
import {
  invasionAssetUrl,
  invasionPresentationMetadata,
  InvasionPresenter,
  type InvasionGltfLike,
} from '../../src/three/invasion-presenter';

function authoredLoader(
  rejectId?: string,
): InvasionGltfLike & { loadAsync: ReturnType<typeof vi.fn> } {
  const loadAsync = vi.fn(async (url: string) => {
    const definition = boardingInvasionDefinition.assets.find((asset) => url.endsWith(asset.path));
    if (!definition) throw new Error(`Unknown test asset ${url}`);
    if (definition.id === rejectId) throw new Error(`Rejected ${definition.id}`);
    const scene = new THREE.Group();
    scene.name = `${definition.id} scene`;
    for (const nodeName of definition.requiredNodes) {
      const node = new THREE.Group();
      node.name = nodeName;
      scene.add(node);
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
    mesh.name = `${definition.id} mesh`;
    scene.add(mesh);
    const animations = definition.requiredActions.map(
      (name) => new THREE.AnimationClip(name, 1, []),
    );
    return { scene, animations };
  });
  return { loadAsync };
}

function boardedState(
  enemyKind: BoardingInvasionState['enemyKind'] = 'pirate',
): BoardingInvasionState {
  const state = createBoardingInvasionState();
  return {
    ...state,
    enemyKind,
    phase: 'boarders-aboard',
    phaseElapsed: 2,
    elapsed: 2,
    countdown: state.maxRaidSeconds - 2,
    hostileCount: 6,
    links: Object.fromEntries(
      Object.entries(state.links).map(([id, link]) => [
        id,
        link ? { ...link, status: 'attached' as const } : link,
      ]),
    ),
  };
}

describe('boarding invasion presentation', () => {
  it('maps warning and outcome phases to player-facing event and evacuation metadata', () => {
    const warning = {
      ...createBoardingInvasionState(),
      name: 'Blackwake saboteur boarding',
      enemyKind: 'bomber' as const,
      phase: 'warning' as const,
      countdown: 12,
    };
    expect(invasionPresentationMetadata(warning)).toMatchObject({
      eventId: 'saboteur-boarding-alpha',
      label: 'SABOTEUR BOARDING',
      phaseLabel: 'BOARDING WARNING',
      alert: 'SABOTEUR BOARDING: UNKNOWN FAST CRAFT CLOSING',
      objective: 'Reach promenade. Protect passengers.',
      evacuating: true,
    });
    expect(
      invasionPresentationMetadata({ ...warning, phase: 'repelled' as const }).evacuating,
    ).toBe(false);
  });

  it('loads every authored GLB and stages snapshot-owned links and hostiles', async () => {
    const loader = authoredLoader();
    const presenter = new InvasionPresenter({ baseUrl: '/cruise/', loader });

    await expect(presenter.ready()).resolves.toBe('glb');
    presenter.sync(boardedState(), 'promenade', 2);

    expect(loader.loadAsync).toHaveBeenCalledTimes(boardingInvasionDefinition.assets.length);
    expect(loader.loadAsync).toHaveBeenCalledWith(
      '/cruise/assets/invasions/characters/pirate-boarder.glb',
    );
    expect(invasionAssetUrl('/assets/invasions/weapons/boarding-pistol.glb', '/cruise')).toBe(
      '/cruise/assets/invasions/weapons/boarding-pistol.glb',
    );
    expect(presenter.assetSource).toBe('glb');
    expect(presenter.group.visible).toBe(true);
    expect(presenter.group.userData.hostileCount).toBe(6);
    expect(presenter.group.userData).toMatchObject({
      eventId: 'pirate-boarding-alpha',
      label: 'PIRATE BOARDING',
      phaseLabel: 'BOARDERS ABOARD',
      evacuationSignal: true,
      spawnContract: {
        characterAssetId: 'pirate-boarder-character',
        loadoutAssetIds: ['boarding-pistol', 'boarding-cutlass', 'pirate-gear-crate'],
      },
    });
    expect(
      presenter.group.children.filter((child) => child.userData.hostileIndex !== undefined),
    ).toHaveLength(6);
    expect(
      presenter.group.getObjectByName('invasion link port-boarding-board')?.userData,
    ).toMatchObject({ assetSource: 'glb', status: 'attached', action: 'Attach' });
    expect(presenter.group.getObjectByName('invasion pirate 1')?.userData).toMatchObject({
      assetSource: 'glb',
      action: 'Aim',
      characterAssetId: 'pirate-boarder-character',
    });
  });

  it('shows warning metadata and rebuilds hostile GLBs when event variant changes', async () => {
    const presenter = new InvasionPresenter({ loader: authoredLoader() });
    await presenter.ready();

    const warning = {
      ...createBoardingInvasionState(),
      phase: 'warning' as const,
      countdown: 12,
    };
    presenter.sync(warning, 'promenade', 0);
    expect(presenter.group.visible).toBe(true);
    expect(presenter.group.userData).toMatchObject({
      phase: 'warning',
      evacuationSignal: true,
      eventId: 'pirate-boarding-alpha',
    });

    presenter.sync(boardedState('pirate'), 'promenade', 2);
    presenter.sync(boardedState('bomber'), 'promenade', 3);
    expect(presenter.group.getObjectByName('invasion pirate 1')).toBeUndefined();
    expect(presenter.group.getObjectByName('invasion bomber 1')?.userData).toMatchObject({
      assetSource: 'glb',
      characterAssetId: 'saboteur-boarder-character',
      loadoutAssetIds: ['boarding-pistol', 'satchel-charge'],
    });
    expect(presenter.group.userData.spawnContract).toEqual({
      characterAssetId: 'saboteur-boarder-character',
      loadoutAssetIds: ['boarding-pistol', 'satchel-charge'],
    });
  });

  it('reports a partial fallback without hiding the remaining authored invasion', async () => {
    const presenter = new InvasionPresenter({ loader: authoredLoader('satchel-charge') });

    await expect(presenter.ready()).resolves.toBe('partial-fallback');
    presenter.sync(boardedState('bomber'), 'promenade', 2);

    expect(presenter.failedAssetIds).toEqual(['satchel-charge']);
    expect(presenter.group.visible).toBe(true);
    expect(presenter.group.getObjectByName('invasion bomber 1')?.userData.assetSource).toBe('glb');
  });
});
