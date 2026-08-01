import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const assetSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  sourceFile: z.string().min(1),
  runtimeFile: z.string().min(1),
  license: z.string().min(1),
  owner: z.string().min(1),
  importNotes: z.string(),
  usageReferences: z.array(z.string()),
});
const manifestSchema = z.object({ assets: z.array(assetSchema) });
const manifest = JSON.parse(await readFile('public/assets/manifest.json', 'utf8'));
const result = manifestSchema.safeParse(manifest);
if (!result.success) {
  console.error(result.error.issues);
  process.exitCode = 1;
} else {
  console.log(`Asset catalog valid: ${result.data.assets.length} project-owned assets.`);
}
