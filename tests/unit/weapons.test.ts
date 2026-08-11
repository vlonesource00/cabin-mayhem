import { stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { inspectGlb } from '../../scripts/glb-inspect';
import { weaponArsenalManifest } from '../../src/data/weapons';

const sourceFile = weaponArsenalManifest.sourceFile;

describe('authored defence weapon pack', () => {
  it('exposes four stable silhouettes with unique runtime paths', () => {
    expect(weaponArsenalManifest.assets).toHaveLength(4);
    expect(new Set(weaponArsenalManifest.assets.map((asset) => asset.id)).size).toBe(4);
    expect(new Set(weaponArsenalManifest.assets.map((asset) => asset.path)).size).toBe(4);
    expect(weaponArsenalManifest.assets.map((asset) => asset.silhouette)).toEqual([
      'sidearm',
      'pump-shotgun',
      'compact-smg',
      'flare-gun',
    ]);
  });

  it('uses one production Blender source for every manifest entry', async () => {
    const sourceInfo = await stat(sourceFile);
    expect(sourceInfo.size).toBeGreaterThan(50_000);
    expect(new Set(weaponArsenalManifest.assets.map((asset) => asset.sourceFile))).toEqual(
      new Set([sourceFile]),
    );
  });

  for (const asset of weaponArsenalManifest.assets) {
    it(`${asset.id} loads with its socket and action contract`, async () => {
      const glb = await inspectGlb(`public${asset.path}`);
      const socketNames = asset.sockets.map((socket) => socket.name);
      const actionNames = asset.actions.map((action) => action.name);

      expect(glb.bytes).toBeGreaterThanOrEqual(asset.budget.minBytes);
      expect(glb.bytes).toBeLessThanOrEqual(asset.budget.maxBytes);
      expect(glb.meshNames.length).toBeGreaterThanOrEqual(asset.budget.minMeshes);
      for (const socket of socketNames) expect(glb.nodeNames).toContain(socket);
      expect([...glb.clips.keys()].sort()).toEqual([...actionNames].sort());
      for (const action of actionNames) expect(glb.clips.get(action)).toBeGreaterThan(0);
    });
  }
});
