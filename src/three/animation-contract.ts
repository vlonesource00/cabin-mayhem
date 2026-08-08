import { z } from 'zod';

/**
 * The authored-animation contract shared by the Blender build scripts, the
 * runtime mixer layer and `scripts/validate-assets.ts`.
 *
 * Bone and clip names are a hard interface. `docs/rig-contract.md` explains the
 * conventions; changing a name here without regenerating the GLB will fail asset
 * validation rather than silently degrade at runtime.
 *
 * Nothing in this module is authoritative. A rig that fails to load leaves the
 * procedural layer in `interaction-animation.ts` in charge, and no clip choice
 * ever feeds back into `HostSession`.
 */

const clipSchema = z.object({
  name: z.string().min(1),
  /** Looping clips hold a state; one-shots play once and hand back to a loop. */
  loop: z.boolean(),
  /** Authored frame count at `fps`. Validation checks the GLB against this. */
  frames: z.number().int().positive(),
});

const rigSchema = z.object({
  id: z.string().min(1),
  /** Empty parent the exporter writes above the armature. */
  rootNode: z.string().min(1),
  runtimeFile: z.string().min(1),
  fps: z.number().int().positive(),
  bones: z.array(z.string().min(1)).min(1),
  clips: z.array(clipSchema).min(1),
});

export type AnimationClipContract = z.infer<typeof clipSchema>;
export type RigContract = z.infer<typeof rigSchema>;

/**
 * Frame tolerance when comparing an authored clip to the exported GLB. The
 * export is deterministic, so this only absorbs float rounding, not drift.
 */
export const frameTolerance = 0.25;

const characterRig = {
  id: 'cabin-mayhem-characters',
  rootNode: 'CM_CHARACTER_ROOT',
  runtimeFile: 'assets/characters/cabin-mayhem-characters.glb',
  fps: 30,
  bones: [
    'hips',
    'spine',
    'chest',
    'neck',
    'head',
    'shoulder.L',
    'upperArm.L',
    'forearm.L',
    'hand.L',
    'shoulder.R',
    'upperArm.R',
    'forearm.R',
    'hand.R',
    'thigh.L',
    'shin.L',
    'foot.L',
    'thigh.R',
    'shin.R',
    'foot.R',
  ],
  clips: [
    { name: 'idle', loop: true, frames: 60 },
    { name: 'walk', loop: true, frames: 32 },
    { name: 'sprint', loop: true, frames: 22 },
    { name: 'crouch_idle', loop: true, frames: 48 },
    { name: 'carry_idle', loop: true, frames: 54 },
    { name: 'carry_walk', loop: true, frames: 34 },
    { name: 'push_cart', loop: true, frames: 40 },
    { name: 'serve', loop: false, frames: 26 },
    { name: 'recoil', loop: false, frames: 30 },
    { name: 'throw', loop: false, frames: 24 },
    { name: 'spray', loop: true, frames: 28 },
    { name: 'repair', loop: true, frames: 36 },
    { name: 'brace', loop: true, frames: 40 },
    { name: 'stumble', loop: false, frames: 34 },
    { name: 'celebrate', loop: false, frames: 44 },
    { name: 'seat_idle', loop: true, frames: 72 },
    { name: 'seat_wave', loop: true, frames: 40 },
    { name: 'seat_impatient', loop: true, frames: 26 },
    { name: 'seat_frantic', loop: true, frames: 20 },
    { name: 'seat_receive', loop: false, frames: 30 },
    { name: 'seat_celebrate', loop: false, frames: 42 },
    { name: 'seat_slump', loop: false, frames: 46 },
    { name: 'seat_panic', loop: true, frames: 18 },
    { name: 'seat_brace', loop: true, frames: 36 },
    { name: 'seat_turbulence', loop: true, frames: 24 },
  ],
} as const;

const firstPersonRig = {
  id: 'cabin-mayhem-fp-arms',
  rootNode: 'CM_FPARMS_ROOT',
  runtimeFile: 'assets/characters/cabin-mayhem-fp-arms.glb',
  fps: 30,
  bones: [
    'fp_root',
    'fp_upperArm.R',
    'fp_forearm.R',
    'fp_hand.R',
    'fp_upperArm.L',
    'fp_forearm.L',
    'fp_hand.L',
  ],
  clips: [
    { name: 'fp_idle', loop: true, frames: 90 },
    { name: 'fp_walk', loop: true, frames: 32 },
    { name: 'fp_sprint', loop: true, frames: 20 },
    { name: 'fp_carry_drink', loop: true, frames: 60 },
    { name: 'fp_carry_meal', loop: true, frames: 60 },
    { name: 'fp_carry_medical', loop: true, frames: 60 },
    { name: 'fp_carry_extinguisher', loop: true, frames: 60 },
    { name: 'fp_carry_toolbox', loop: true, frames: 60 },
    { name: 'fp_push_cart', loop: true, frames: 44 },
    { name: 'fp_pickup', loop: false, frames: 22 },
    { name: 'fp_stow', loop: false, frames: 20 },
    { name: 'fp_serve', loop: false, frames: 26 },
    { name: 'fp_recoil', loop: false, frames: 30 },
    { name: 'fp_throw', loop: false, frames: 22 },
    { name: 'fp_spray', loop: true, frames: 24 },
    { name: 'fp_repair', loop: true, frames: 36 },
    { name: 'fp_interact', loop: false, frames: 18 },
    { name: 'fp_brace', loop: true, frames: 34 },
    { name: 'fp_impact', loop: false, frames: 26 },
  ],
} as const;

/** Parsed at module load so a malformed edit fails fast in every consumer. */
export const rigContracts: readonly RigContract[] = z
  .array(rigSchema)
  .parse([characterRig, firstPersonRig]);

export function rigContract(id: string): RigContract {
  const rig = rigContracts.find((entry) => entry.id === id);
  if (!rig) throw new Error(`Unknown rig contract: ${id}`);
  return rig;
}

export const characterRigId = characterRig.id;
export const firstPersonRigId = firstPersonRig.id;

/** Authored duration in seconds, used to time crossfades and one-shot holds. */
export function clipSeconds(rig: RigContract, name: string): number {
  const clip = rig.clips.find((entry) => entry.name === name);
  if (!clip) throw new Error(`Clip ${name} is not part of rig ${rig.id}.`);
  return (clip.frames - 1) / rig.fps;
}

export function isLooping(rig: RigContract, name: string): boolean {
  return rig.clips.find((entry) => entry.name === name)?.loop ?? true;
}
