import { clamp } from '../sim/math';
import type { MissionState, PassengerState } from '../sim/types';

/** One-shot hand gestures implied by an authoritative state change. */
export type GestureKind = 'grab' | 'stow' | 'serve' | 'reject';

/**
 * Offsets layered on top of the held-item transform. Presentation only: the
 * host has already decided the outcome by the time a pose is produced, so a
 * dropped or delayed snapshot can never change what the simulation resolved.
 */
export interface HandPose {
  /** Metres along the view direction; negative reaches away from the camera. */
  push: number;
  /** Metres of vertical lift. */
  lift: number;
  /** Radians of roll about the view axis. */
  roll: number;
  /** Radians of extra wrist pitch. */
  pitch: number;
}

export const restPose: HandPose = { push: 0, lift: 0, roll: 0, pitch: 0 };

const gestureSeconds: Record<GestureKind, number> = {
  grab: 0.3,
  stow: 0.26,
  serve: 0.44,
  reject: 0.5,
};

/** Bounded so a burst of deltas cannot stack into an unreadable pose. */
const maxActiveGestures = 3;

export function gestureDuration(kind: GestureKind): number {
  return gestureSeconds[kind];
}

const bump = (t: number): number => Math.sin(Math.PI * t);

function gesturePose(kind: GestureKind, t: number): HandPose {
  const rise = bump(t);
  switch (kind) {
    case 'grab':
      return { push: -0.14 * rise, lift: -0.1 * rise, roll: 0, pitch: 0.34 * rise };
    case 'stow':
      return { push: 0.18 * rise, lift: -0.12 * rise, roll: 0, pitch: -0.26 * rise };
    case 'serve':
      return { push: -0.34 * rise, lift: 0.06 * rise, roll: 0, pitch: -0.42 * rise };
    case 'reject':
      return {
        push: 0.06 * rise,
        lift: -0.07 * rise,
        roll: 0.5 * rise * Math.sin(t * 19),
        pitch: 0,
      };
  }
}

/**
 * Sustained pose for an ongoing host-validated action. `spray` shakes while a
 * fire is losing intensity; `wrench` twists while the breaker hold is running.
 */
function sustainedPose(state: MissionState, holdsTool: boolean, elapsed: number): HandPose {
  if (!holdsTool) return restPose;
  if (state.repair.status === 'repairing')
    return {
      push: -0.05,
      lift: -0.03 + Math.sin(elapsed * 13) * 0.02,
      roll: Math.sin(elapsed * 11) * 0.3,
      pitch: 0.12,
    };
  if (state.fire.status === 'active')
    return {
      push: -0.09 + Math.sin(elapsed * 26) * 0.015,
      lift: 0.02,
      roll: Math.sin(elapsed * 31) * 0.06,
      pitch: -0.18,
    };
  return restPose;
}

const addPose = (a: HandPose, b: HandPose): HandPose => ({
  push: a.push + b.push,
  lift: a.lift + b.lift,
  roll: a.roll + b.roll,
  pitch: a.pitch + b.pitch,
});

/**
 * Gestures implied by the step from `previous` to `next`, read from
 * authoritative state deltas rather than event text so the stream survives
 * dropped snapshots and stays identical for host, guest and solo.
 */
export function handGestures(
  previous: MissionState | undefined,
  next: MissionState,
  localPlayerId: string,
): GestureKind[] {
  if (!previous) return [];
  const gestures: GestureKind[] = [];
  const before = previous.cabin.players[localPlayerId]?.heldObjectId;
  const after = next.cabin.players[localPlayerId]?.heldObjectId;
  if (before !== after) gestures.push(after ? 'grab' : 'stow');
  if (next.service.served > previous.service.served) gestures.push('serve');
  if (next.service.missed > previous.service.missed && after) gestures.push('reject');
  return gestures;
}

interface ActiveGesture {
  kind: GestureKind;
  startedAt: number;
}

/**
 * Plays gestures against the presentation clock. Holds no simulation state and
 * never reports back to the host.
 */
export class GesturePlayer {
  private readonly active: ActiveGesture[] = [];

  public push(kinds: readonly GestureKind[], now: number): void {
    for (const kind of kinds) this.active.push({ kind, startedAt: now });
    if (this.active.length > maxActiveGestures)
      this.active.splice(0, this.active.length - maxActiveGestures);
  }

  public pose(state: MissionState, holdsTool: boolean, now: number): HandPose {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const gesture = this.active[index];
      if (gesture && now - gesture.startedAt >= gestureDuration(gesture.kind))
        this.active.splice(index, 1);
    }
    let pose = sustainedPose(state, holdsTool, now);
    for (const gesture of this.active) {
      const t = clamp((now - gesture.startedAt) / gestureDuration(gesture.kind), 0, 1);
      pose = addPose(pose, gesturePose(gesture.kind, t));
    }
    return pose;
  }

  public clear(): void {
    this.active.length = 0;
  }
}

/** Seated passenger reaction offsets. */
export interface PassengerPose {
  /** Metres of vertical bounce. */
  bob: number;
  /** Radians of forward/side lean. */
  lean: number;
  /** 0..1 arm raise for waving or celebrating. */
  armLift: number;
}

/** How long a served/missed reaction plays before the passenger settles. */
export const reactionSeconds = 1.4;

/**
 * Pose for one passenger. `reactionAge` is seconds since the request status
 * last changed; pass a large number when nothing has changed recently.
 */
export function passengerPose(
  passenger: PassengerState,
  elapsed: number,
  reactionAge: number,
): PassengerPose {
  const fresh = clamp(1 - reactionAge / reactionSeconds, 0, 1);
  if (passenger.requestStatus === 'served' && fresh > 0)
    return {
      bob: Math.abs(Math.sin(reactionAge * 11)) * 0.07 * fresh,
      lean: 0,
      armLift: fresh,
    };
  if (passenger.requestStatus === 'missed' && fresh > 0)
    return { bob: 0, lean: 0.3 * fresh, armLift: 0 };
  if (passenger.requestStatus === 'active') {
    const urgency = clamp(1 - passenger.patience, 0, 1);
    return {
      bob: Math.sin(elapsed * (3 + urgency * 5)) * 0.012,
      lean: 0,
      armLift: 0.3 + urgency * 0.45,
    };
  }
  return { bob: 0, lean: 0, armLift: 0 };
}
