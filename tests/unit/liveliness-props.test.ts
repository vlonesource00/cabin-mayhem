import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectGlb } from '../../scripts/glb-inspect';
import { livelinessPropManifest } from '../../src/data/liveliness-props';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const fileFor = (relativePath: string) => resolve(projectRoot, relativePath);

describe('authored liveliness prop pack', () => {
  it('contains six job-facing prop contracts', () => {
    expect(livelinessPropManifest.assets).toHaveLength(6);
    expect(livelinessPropManifest.assets.map((asset) => asset.job)).toEqual([
      'pool-cleaning',
      'mall-restock',
      'laundry-housekeeping',
      'medical-response',
      'emergency-response',
      'helm-radio-task',
    ]);
  });

  for (const asset of livelinessPropManifest.assets) {
    it(`${asset.id} satisfies its GLB contract`, async () => {
      const runtimeFile = fileFor(`public${asset.path}`);
      const [sourceInfo, glb] = await Promise.all([
        stat(fileFor(asset.sourceFile)),
        inspectGlb(runtimeFile),
      ]);

      expect(sourceInfo.size).toBeGreaterThan(50_000);
      expect(glb.bytes).toBeGreaterThan(10_000);
      expect(glb.meshNames.length).toBeGreaterThan(8);
      for (const node of asset.requiredNodes) expect(glb.nodeNames).toContain(node);
      expect([...glb.clips.keys()].sort()).toEqual([...asset.requiredActions].sort());
      for (const action of asset.requiredActions) expect(glb.clips.get(action)).toBeGreaterThan(0);
      expect(glb.meshNames.length).toBeLessThanOrEqual(asset.budget.maxDrawMeshes);
      expect(glb.nodeNames.length).toBeLessThanOrEqual(asset.budget.maxNodes);
      expect(glb.bytes).toBeLessThanOrEqual(asset.budget.maxBytes);
      expect(glb.nodeNames.filter((node) => node === asset.rootNode)).toHaveLength(1);
    });
  }
});
