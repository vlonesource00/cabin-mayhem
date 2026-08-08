import { readFile } from 'node:fs/promises';

/**
 * Minimal GLB reader for build-time contract checks.
 *
 * Only the JSON chunk is parsed. Clip durations come from each sampler input
 * accessor's `max`, which glTF requires exporters to write, so no binary buffer
 * decoding is needed to verify that an authored clip survived export.
 */

interface Accessor {
  max?: number[];
}

interface AnimationSampler {
  input: number;
}

interface Animation {
  name?: string;
  samplers: AnimationSampler[];
}

interface Skin {
  joints: number[];
}

interface Node {
  name?: string;
}

interface GltfJson {
  accessors?: Accessor[];
  animations?: Animation[];
  skins?: Skin[];
  nodes?: Node[];
  meshes?: { name?: string }[];
}

export interface GlbSummary {
  bytes: number;
  nodeNames: string[];
  meshNames: string[];
  jointNames: string[];
  /** Clip name to duration in seconds. */
  clips: Map<string, number>;
}

const magic = 0x46546c67; // "glTF"

export async function inspectGlb(path: string): Promise<GlbSummary> {
  const file = await readFile(path);
  if (file.length < 20 || file.readUInt32LE(0) !== magic)
    throw new Error(`${path} is not a GLB container.`);
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8')) as GltfJson;

  const nodes = json.nodes ?? [];
  const accessors = json.accessors ?? [];
  const nodeNames = nodes.map((node) => node.name ?? '');
  const jointNames = (json.skins ?? []).flatMap((skin) =>
    skin.joints.map((index) => nodes[index]?.name ?? ''),
  );

  const clips = new Map<string, number>();
  for (const animation of json.animations ?? []) {
    let duration = 0;
    for (const sampler of animation.samplers) {
      const end = accessors[sampler.input]?.max?.[0];
      if (typeof end === 'number' && end > duration) duration = end;
    }
    clips.set(animation.name ?? '', duration);
  }

  return {
    bytes: file.length,
    nodeNames,
    meshNames: (json.meshes ?? []).map((mesh) => mesh.name ?? ''),
    jointNames,
    clips,
  };
}
