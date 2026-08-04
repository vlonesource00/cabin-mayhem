import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import { inspectGlb } from './glb-inspect';
import { clipSeconds, frameTolerance, rigContracts } from '../src/three/animation-contract';
import { shipLayout } from '../src/data/ship-layout';

const compartmentAssetId = (id: string) => `cabin-mayhem-compartment-${id}`;
const compartmentRootName = (id: string) => `CM_${id.toUpperCase().replace(/-/g, '_')}_ROOT`;
const portalMarkerName = (target: string) => `CM_PORTAL_${target.toUpperCase().replace(/-/g, '_')}`;

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
  const missing: string[] = [];
  for (const asset of result.data.assets) {
    for (const file of [asset.sourceFile, asset.runtimeFile]) {
      try {
        const info = await stat(file);
        if (!info.isFile() || info.size === 0) missing.push(`${asset.id}: ${file}`);
      } catch {
        missing.push(`${asset.id}: ${file}`);
      }
    }
  }
  if (missing.length > 0) {
    console.error('Missing or empty asset files:', missing);
    process.exitCode = 1;
  } else console.log(`Asset catalog valid: ${result.data.assets.length} project-owned assets.`);

  // Every rig in the animation contract must be catalogued and must actually
  // contain the skeleton and clips the runtime will ask for. A rename in Blender
  // that never reached the contract fails here rather than at load time.
  const violations: string[] = [];
  for (const rig of rigContracts) {
    const entry = result.data.assets.find((asset) => asset.id === rig.id);
    if (!entry) {
      violations.push(`${rig.id}: not listed in the asset manifest`);
      continue;
    }
    const glb = await inspectGlb(entry.runtimeFile);

    if (!glb.nodeNames.includes(rig.rootNode))
      violations.push(`${rig.id}: missing root node ${rig.rootNode}`);

    for (const bone of rig.bones)
      if (!glb.jointNames.includes(bone)) violations.push(`${rig.id}: missing joint ${bone}`);
    if (glb.jointNames.length !== rig.bones.length)
      violations.push(
        `${rig.id}: exported ${glb.jointNames.length} joints, contract declares ${rig.bones.length}`,
      );

    for (const clip of rig.clips) {
      const duration = glb.clips.get(clip.name);
      if (duration === undefined) {
        violations.push(`${rig.id}: missing clip ${clip.name}`);
        continue;
      }
      if (duration <= 0) {
        violations.push(`${rig.id}: clip ${clip.name} exported with zero duration`);
        continue;
      }
      const drift = Math.abs(duration - clipSeconds(rig, clip.name)) * rig.fps;
      if (drift > frameTolerance)
        violations.push(
          `${rig.id}: clip ${clip.name} is ${duration.toFixed(3)}s, contract expects ` +
            `${clipSeconds(rig, clip.name).toFixed(3)}s`,
        );
    }

    const extra = [...glb.clips.keys()].filter(
      (name) => !rig.clips.some((clip) => clip.name === name),
    );
    for (const name of extra) violations.push(`${rig.id}: undeclared clip ${name}`);
  }

  if (violations.length > 0) {
    console.error('Rig contract violations:', violations);
    process.exitCode = 1;
  } else {
    const clipTotal = rigContracts.reduce((sum, rig) => sum + rig.clips.length, 0);
    console.log(`Rig contract valid: ${rigContracts.length} rigs, ${clipTotal} authored clips.`);
  }

  // Every compartment in the ship layout must have an exported room that the
  // streamer can actually resolve, and it must fit the budget it declares. A
  // compartment that overruns its budget fails here, not on the player's frame.
  const compartmentViolations: string[] = [];
  for (const compartment of shipLayout.compartments) {
    const entry = result.data.assets.find(
      (asset) => asset.id === compartmentAssetId(compartment.id),
    );
    if (!entry) {
      compartmentViolations.push(`${compartment.id}: not listed in the asset manifest`);
      continue;
    }
    const glb = await inspectGlb(entry.runtimeFile);

    const root = compartmentRootName(compartment.id);
    if (!glb.nodeNames.includes(root))
      compartmentViolations.push(`${compartment.id}: missing root node ${root}`);
    for (const portal of compartment.portals) {
      const marker = portalMarkerName(portal.target);
      if (!glb.nodeNames.includes(marker))
        compartmentViolations.push(`${compartment.id}: missing portal empty ${marker}`);
    }

    if (glb.meshNames.length > compartment.budget.maxDrawMeshes)
      compartmentViolations.push(
        `${compartment.id}: ${glb.meshNames.length} draw meshes exceeds the budget of ` +
          `${compartment.budget.maxDrawMeshes}`,
      );
    if (glb.bytes > compartment.budget.maxBytes)
      compartmentViolations.push(
        `${compartment.id}: ${glb.bytes} bytes exceeds the budget of ${compartment.budget.maxBytes}`,
      );
  }

  if (compartmentViolations.length > 0) {
    console.error('Compartment budget violations:', compartmentViolations);
    process.exitCode = 1;
  } else {
    console.log(`Compartments valid: ${shipLayout.compartments.length} rooms within budget.`);
  }
}
