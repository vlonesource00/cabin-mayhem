import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { inspectGlb } from './glb-inspect';
import { livelinessPropManifest, livelinessPropManifestSchema } from '../src/data/liveliness-props';

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

const fileFor = (relativePath: string) => resolve(projectRoot, relativePath);

const runtimeFileFor = (assetPath: string) => fileFor(`public${assetPath}`);

const main = async () => {
  const manifestResult = livelinessPropManifestSchema.safeParse(livelinessPropManifest);
  if (!manifestResult.success) {
    console.error('Liveliness manifest schema violations:', manifestResult.error.issues);
    process.exitCode = 1;
    return;
  }

  const violations: string[] = [];
  const inventory: string[] = [];
  for (const asset of manifestResult.data.assets) {
    const sourceFile = fileFor(asset.sourceFile);
    const runtimeFile = runtimeFileFor(asset.path);
    try {
      const [sourceInfo, glb] = await Promise.all([stat(sourceFile), inspectGlb(runtimeFile)]);
      const missingNodes = asset.requiredNodes.filter((node) => !glb.nodeNames.includes(node));
      if (missingNodes.length > 0)
        violations.push(`${asset.id}: missing required nodes ${missingNodes.join(', ')}`);

      const expectedActions = [...asset.requiredActions].sort();
      const actualActions = [...glb.clips.keys()].sort();
      if (JSON.stringify(actualActions) !== JSON.stringify(expectedActions))
        violations.push(
          `${asset.id}: actions ${actualActions.join(', ')} do not equal ${expectedActions.join(', ')}`,
        );
      for (const action of asset.requiredActions) {
        const duration = glb.clips.get(action);
        if (typeof duration !== 'number' || duration <= 0)
          violations.push(`${asset.id}: action ${action} has no positive exported duration`);
      }

      if (glb.meshNames.length > asset.budget.maxDrawMeshes)
        violations.push(
          `${asset.id}: ${glb.meshNames.length} draw meshes exceeds ${asset.budget.maxDrawMeshes}`,
        );
      if (glb.nodeNames.length > asset.budget.maxNodes)
        violations.push(
          `${asset.id}: ${glb.nodeNames.length} nodes exceeds ${asset.budget.maxNodes}`,
        );
      if (glb.bytes > asset.budget.maxBytes)
        violations.push(`${asset.id}: ${glb.bytes} bytes exceeds ${asset.budget.maxBytes}`);

      inventory.push(
        `${asset.id}: ${glb.bytes} bytes, ${glb.meshNames.length} meshes, ${glb.nodeNames.length} nodes, ` +
          `${actualActions.length} actions, source ${sourceInfo.size} bytes`,
      );
    } catch (error) {
      violations.push(`${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (violations.length > 0) {
    console.error('Liveliness asset violations:');
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Liveliness assets valid: ${inventory.length} GLBs within manifest contracts.`);
  for (const line of inventory) console.log(`- ${line}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
