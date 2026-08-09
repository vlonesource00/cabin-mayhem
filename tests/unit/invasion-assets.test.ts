import { stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { inspectGlb } from '../../scripts/glb-inspect';
import { boardingInvasionDefinition } from '../../src/data/invasions';

const sourceFileFor = (runtimePath: string) =>
  `assets-src/blender/invasions/${runtimePath
    .split('/')
    .at(-1)
    ?.replace(/\.glb$/, '.blend')}`;

describe('authored invasion asset pack', () => {
  for (const asset of boardingInvasionDefinition.assets) {
    it(`${asset.id} satisfies its frozen GLB contract`, async () => {
      const runtimeFile = `public${asset.path}`;
      const [sourceInfo, glb] = await Promise.all([
        stat(sourceFileFor(asset.path)),
        inspectGlb(runtimeFile),
      ]);

      expect(sourceInfo.size).toBeGreaterThan(50_000);
      expect(glb.bytes).toBeGreaterThan(10_000);
      expect(glb.meshNames.length).toBeGreaterThanOrEqual(asset.role === 'character' ? 20 : 6);
      for (const node of asset.requiredNodes) expect(glb.nodeNames).toContain(node);
      for (const action of asset.requiredActions) expect(glb.clips.has(action)).toBe(true);
      expect([...glb.clips.keys()].sort()).toEqual([...asset.requiredActions].sort());

      if (asset.role === 'character') {
        expect(glb.jointNames.length).toBe(18);
        expect(glb.jointNames).toContain('root');
        expect(glb.jointNames).toContain('head');
        expect(glb.jointNames).toContain('hand.R');
      }
    });
  }
});
