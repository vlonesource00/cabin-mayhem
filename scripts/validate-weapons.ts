import { stat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inspectGlb } from './glb-inspect';
import { weaponArsenalManifest, type WeaponAsset } from '../src/data/weapons';

type Accessor = {
  count?: number;
  max?: number[];
};

type Primitive = {
  attributes?: { POSITION?: number };
  indices?: number;
  mode?: number;
};

type GltfJson = {
  asset?: { version?: string };
  accessors?: Accessor[];
  animations?: Array<{
    name?: string;
    samplers?: Array<{ input?: number }>;
  }>;
  buffers?: unknown[];
  bufferViews?: unknown[];
  materials?: unknown[];
  meshes?: Array<{ name?: string; primitives?: Primitive[] }>;
  nodes?: Array<{ name?: string }>;
};

const ROOT = resolve(import.meta.dirname, '..');
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function readGlbJson(raw: Buffer, path: string): GltfJson {
  if (raw.length < 20 || raw.toString('ascii', 0, 4) !== 'glTF')
    throw new Error(`${path}: not a GLB container`);
  const version = raw.readUInt32LE(4);
  const totalLength = raw.readUInt32LE(8);
  if (version !== 2) throw new Error(`${path}: GLB version ${version}, expected 2`);
  if (totalLength !== raw.length)
    throw new Error(`${path}: header length ${totalLength} does not match ${raw.length}`);

  let offset = 12;
  let json: GltfJson | undefined;
  let binChunks = 0;
  while (offset < raw.length) {
    if (offset + 8 > raw.length) throw new Error(`${path}: truncated GLB chunk header`);
    const chunkLength = raw.readUInt32LE(offset);
    const chunkType = raw.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > raw.length) throw new Error(`${path}: truncated GLB chunk payload`);
    if (chunkType === JSON_CHUNK) {
      if (json) throw new Error(`${path}: multiple JSON chunks`);
      const text = raw.toString('utf8', chunkStart, chunkEnd).replace(/\0+$/, '').trim();
      json = JSON.parse(text) as GltfJson;
    } else if (chunkType === BIN_CHUNK) {
      binChunks += 1;
    }
    offset = chunkEnd;
  }
  if (offset !== raw.length) throw new Error(`${path}: chunk alignment exceeds container`);
  if (!json) throw new Error(`${path}: missing JSON chunk`);
  if (binChunks < 1) throw new Error(`${path}: missing binary chunk`);
  return json;
}

function trianglesForPrimitive(primitive: Primitive, accessors: Accessor[]): number {
  const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
  if (typeof accessorIndex !== 'number') return 0;
  const count = accessors[accessorIndex]?.count ?? 0;
  const mode = primitive.mode ?? 4;
  if (mode === 4) return Math.floor(count / 3);
  if (mode === 5 || mode === 6) return Math.max(0, count - 2);
  return 0;
}

function triangleCount(gltf: GltfJson): number {
  const accessors = gltf.accessors ?? [];
  return (gltf.meshes ?? []).reduce(
    (total, mesh) =>
      total +
      (mesh.primitives ?? []).reduce(
        (meshTotal, primitive) => meshTotal + trianglesForPrimitive(primitive, accessors),
        0,
      ),
    0,
  );
}

function animationDuration(
  animation: NonNullable<GltfJson['animations']>[number],
  accessors: Accessor[],
): number {
  return Math.max(
    0,
    ...(animation.samplers ?? []).map((sampler) => {
      const end =
        typeof sampler.input === 'number' ? accessors[sampler.input]?.max?.[0] : undefined;
      return typeof end === 'number' ? end : 0;
    }),
  );
}

function expectedAction(asset: WeaponAsset, name: string) {
  return asset.actions.find((action) => action.name === name);
}

async function validateAsset(asset: WeaponAsset, sourceBytes: number): Promise<string[]> {
  const failures: string[] = [];
  const runtimePath = resolve(ROOT, 'public', asset.path.slice(1));
  const raw = await readFile(runtimePath);
  const gltf = readGlbJson(raw, asset.path);
  const glb = await inspectGlb(runtimePath);
  const nodes = gltf.nodes ?? [];
  const nodeNames = new Set(nodes.map((node) => node.name ?? ''));
  const actionNames = new Set((gltf.animations ?? []).map((animation) => animation.name ?? ''));
  const expectedSockets = asset.sockets.map((socket) => socket.name);
  const expectedActions = asset.actions.map((action) => action.name);
  const meshes = gltf.meshes ?? [];
  const materials = gltf.materials ?? [];
  const triangles = triangleCount(gltf);
  const budget = asset.budget;

  if (gltf.asset?.version !== '2.0') failures.push(`${asset.id}: asset.version is not 2.0`);
  if (!gltf.buffers?.length) failures.push(`${asset.id}: missing glTF buffers`);
  if (!gltf.bufferViews?.length) failures.push(`${asset.id}: missing glTF bufferViews`);
  if (sourceBytes < 50_000) failures.push(`${asset.id}: source blend is only ${sourceBytes} bytes`);
  if (raw.length < budget.minBytes || raw.length > budget.maxBytes)
    failures.push(`${asset.id}: ${raw.length} bytes outside ${budget.minBytes}-${budget.maxBytes}`);
  if (triangles < budget.minTriangles || triangles > budget.maxTriangles)
    failures.push(
      `${asset.id}: ${triangles} triangles outside ${budget.minTriangles}-${budget.maxTriangles}`,
    );
  if (meshes.length < budget.minMeshes || meshes.length > budget.maxMeshes)
    failures.push(
      `${asset.id}: ${meshes.length} meshes outside ${budget.minMeshes}-${budget.maxMeshes}`,
    );
  if (materials.length < budget.minMaterials)
    failures.push(`${asset.id}: ${materials.length} materials below ${budget.minMaterials}`);
  if (materials.length > budget.maxMaterials)
    failures.push(`${asset.id}: ${materials.length} materials exceeds ${budget.maxMaterials}`);
  if (nodes.length > budget.maxNodes)
    failures.push(`${asset.id}: ${nodes.length} nodes exceeds ${budget.maxNodes}`);

  for (const socket of expectedSockets) {
    if (!nodeNames.has(socket)) failures.push(`${asset.id}: missing socket node ${socket}`);
  }
  if (
    actionNames.size !== expectedActions.length ||
    expectedActions.some((action) => !actionNames.has(action))
  )
    failures.push(
      `${asset.id}: action names ${[...actionNames].sort().join(',')} do not equal ${expectedActions.join(',')}`,
    );

  const accessors = gltf.accessors ?? [];
  for (const animation of gltf.animations ?? []) {
    const name = animation.name ?? '';
    const duration = animationDuration(animation, accessors);
    const expected = expectedAction(asset, name);
    if (!expected) continue;
    if (duration <= 0) failures.push(`${asset.id}: ${name} has zero duration`);
    if (Math.abs(duration - expected.durationSeconds) > 0.06)
      failures.push(
        `${asset.id}: ${name} duration ${duration.toFixed(4)} differs from ${expected.durationSeconds}`,
      );
  }
  if (glb.nodeNames.length !== nodes.length)
    failures.push(`${asset.id}: inspector node count mismatch`);
  if (glb.meshNames.length !== meshes.length)
    failures.push(`${asset.id}: inspector mesh count mismatch`);

  if (failures.length === 0)
    return [
      `PASS ${asset.id}: ${raw.length} bytes, ${triangles} triangles, ${meshes.length} meshes, ${materials.length} materials, ${nodes.length} nodes, ${expectedActions.length} Actions`,
    ];
  return failures;
}

async function main() {
  const failures: string[] = [];
  const sourcePath = resolve(ROOT, weaponArsenalManifest.sourceFile);
  const sourceInfo = await stat(sourcePath);
  const results: string[] = [];

  for (const asset of weaponArsenalManifest.assets) {
    try {
      const assetResults = await validateAsset(asset, sourceInfo.size);
      for (const result of assetResults) {
        if (result.startsWith('PASS ')) results.push(result);
        else failures.push(result);
      }
    } catch (error) {
      failures.push(`${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const line of results) console.log(line);
  if (failures.length > 0) {
    console.error('\nWeapon asset contract violations:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Weapon asset pack valid: ${weaponArsenalManifest.assets.length} GLBs and shared Blender source.`,
  );
}

await main();
