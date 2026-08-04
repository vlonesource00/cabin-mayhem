import type { CabinObject, MissionState, PassengerState, PlayerState } from '../sim/types';

/**
 * Snapshot-to-clip projection for the authored rigs.
 *
 * Every function here is pure and reads only authoritative state the host has
 * already resolved. Animation reports nothing back: it never decides whether a
 * delivery, repair or fire suppression succeeded, and a wrong clip choice can
 * only ever look wrong, never change the simulation.
 *
 * Clip names must exist in `animation-contract.ts`; `tests/unit` asserts that.
 */

/** Looping lower-body state. */
export type CrewMotion = 'idle' | 'walk' | 'sprint' | 'crouch';

/** Looping upper-body state layered over the motion clip. */
export type CrewStance = 'none' | 'carry' | 'push_cart' | 'spray' | 'repair' | 'brace';

/** One-shot reactions triggered by a state delta rather than a state value. */
export type CrewOneShot = 'serve' | 'recoil' | 'throw' | 'stumble' | 'celebrate';

/** Speeds in metres per second. Below `walkSpeed` the crew reads as standing. */
const walkSpeed = 0.35;
const sprintSpeed = 3.1;

const speedOf = (player: PlayerState): number => Math.hypot(player.velocity.x, player.velocity.y);

export function crewMotion(player: PlayerState): CrewMotion {
  if (player.crouched) return 'crouch';
  const speed = speedOf(player);
  if (speed >= sprintSpeed) return 'sprint';
  if (speed >= walkSpeed) return 'walk';
  return 'idle';
}

/**
 * Stance precedence is deliberate: bracing outranks everything because it is the
 * only stance tied to a survival input, and an active fire outranks a repair
 * because the host applies the same priority to the objectives themselves.
 */
export function crewStance(
  state: MissionState,
  player: PlayerState,
  held: CabinObject | undefined,
): CrewStance {
  if (player.braced) return 'brace';
  if (held?.kind === 'extinguisher' && state.fire.status === 'active') return 'spray';
  if (held?.kind === 'toolbox' && state.repair.status === 'repairing') return 'repair';
  if (held?.kind === 'cart') return 'push_cart';
  if (held) return 'carry';
  return 'none';
}

const motionClips: Record<CrewMotion, string> = {
  idle: 'idle',
  walk: 'walk',
  sprint: 'sprint',
  crouch: 'crouch_idle',
};

/** Stances that replace the locomotion clip outright instead of layering. */
const stanceBaseClips: Partial<Record<CrewStance, Record<'moving' | 'still', string>>> = {
  carry: { moving: 'carry_walk', still: 'carry_idle' },
  push_cart: { moving: 'push_cart', still: 'push_cart' },
  brace: { moving: 'brace', still: 'brace' },
};

export interface CrewClipSelection {
  /** Full-body looping clip. Always present. */
  base: string;
  /** Upper-body clip layered over `base`, or undefined when nothing is layered. */
  layer?: string;
}

export function crewClips(motion: CrewMotion, stance: CrewStance): CrewClipSelection {
  const swap = stanceBaseClips[stance];
  if (swap) return { base: swap[motion === 'idle' || motion === 'crouch' ? 'still' : 'moving'] };
  const base = motionClips[motion];
  if (stance === 'spray') return { base, layer: 'spray' };
  if (stance === 'repair') return { base, layer: 'repair' };
  return { base };
}

/**
 * One-shots implied by the step from `previous` to `next`. Read from state
 * deltas rather than event text so the stream survives a dropped snapshot and
 * stays identical for host, guest and solo — the same rule
 * `interaction-animation.ts` follows for its procedural gestures.
 */
export function crewOneShots(
  previous: MissionState | undefined,
  next: MissionState,
  playerId: string,
): CrewOneShot[] {
  if (!previous) return [];
  const before = previous.cabin.players[playerId];
  const after = next.cabin.players[playerId];
  if (!before || !after) return [];

  const shots: CrewOneShot[] = [];
  if (next.service.served > previous.service.served) shots.push('serve');
  if (next.service.missed > previous.service.missed) shots.push('recoil');
  if (before.heldObjectId && !after.heldObjectId && next.cabin.lastImpulse > 0) shots.push('throw');
  if (after.knockdown > 0 && before.knockdown <= 0) shots.push('stumble');
  if (next.service.outcome === 'success' && previous.service.outcome === 'active')
    shots.push('celebrate');
  return shots;
}

/** Seated passenger state. One clip per state; no layering on the seat rig. */
export type PassengerAnimationState =
  | 'idle'
  | 'wave'
  | 'impatient'
  | 'frantic'
  | 'receive'
  | 'celebrate'
  | 'slump'
  | 'panic'
  | 'brace'
  | 'turbulence';

/** Patience below this reads as impatient; below half of it, frantic. */
const impatientBelow = 0.55;
const franticBelow = 0.25;
/** Panic and turbulence thresholds tuned so the cabin is not constantly flailing. */
const panicAbove = 0.6;
const braceAbove = 0.35;
const turbulenceAbove = 0.18;

/**
 * `reactionAge` is seconds since `requestStatus` last changed. Pass a large
 * number when nothing recent happened; the caller owns that clock because the
 * host snapshot carries no per-passenger timestamp.
 */
export function passengerAnimationState(
  passenger: PassengerState,
  state: MissionState,
  reactionAge: number,
): PassengerAnimationState {
  const fresh = reactionAge < 1.4;
  if (passenger.injury > 0.5) return 'slump';
  if (passenger.panic > panicAbove) return 'panic';
  if (fresh && passenger.requestStatus === 'served')
    return passenger.satisfaction > 0.7 ? 'celebrate' : 'receive';
  if (state.voyage.turbulence > braceAbove) return 'brace';
  if (state.voyage.turbulence > turbulenceAbove) return 'turbulence';
  if (passenger.requestStatus === 'active') {
    if (passenger.patience < franticBelow) return 'frantic';
    if (passenger.patience < impatientBelow) return 'impatient';
    return 'wave';
  }
  return 'idle';
}

const passengerClips: Record<PassengerAnimationState, string> = {
  idle: 'seat_idle',
  wave: 'seat_wave',
  impatient: 'seat_impatient',
  frantic: 'seat_frantic',
  receive: 'seat_receive',
  celebrate: 'seat_celebrate',
  slump: 'seat_slump',
  panic: 'seat_panic',
  brace: 'seat_brace',
  turbulence: 'seat_turbulence',
};

export function passengerClip(state: PassengerAnimationState): string {
  return passengerClips[state];
}

/** Carried categories the first-person arms hold at distinct heights. */
const carryClips: Partial<Record<CabinObject['kind'], string>> = {
  drink: 'fp_carry_drink',
  'meal-tray': 'fp_carry_meal',
  medkit: 'fp_carry_medical',
  extinguisher: 'fp_carry_extinguisher',
  toolbox: 'fp_carry_toolbox',
};

/**
 * First-person arms clip for the local crew member. Falls back to the drink
 * carry pose for uncategorised props: holding something generic still has to
 * look like holding something.
 */
export function firstPersonClip(
  state: MissionState,
  player: PlayerState,
  held: CabinObject | undefined,
): string {
  const stance = crewStance(state, player, held);
  if (stance === 'brace') return 'fp_brace';
  if (stance === 'spray') return 'fp_spray';
  if (stance === 'repair') return 'fp_repair';
  if (stance === 'push_cart') return 'fp_push_cart';
  if (held) return carryClips[held.kind] ?? 'fp_carry_drink';
  const motion = crewMotion(player);
  if (motion === 'sprint') return 'fp_sprint';
  if (motion === 'walk') return 'fp_walk';
  return 'fp_idle';
}

const oneShotArmClips: Record<CrewOneShot, string> = {
  serve: 'fp_serve',
  recoil: 'fp_recoil',
  throw: 'fp_throw',
  stumble: 'fp_impact',
  celebrate: 'fp_interact',
};

export function firstPersonOneShotClip(shot: CrewOneShot): string {
  return oneShotArmClips[shot];
}

export function crewOneShotClip(shot: CrewOneShot): string {
  return shot === 'stumble' ? 'stumble' : shot;
}
