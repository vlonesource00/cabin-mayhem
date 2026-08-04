import { clamp, finite } from './math';
import { advanceSea, createHullMotion, createSeaState, sampleHullMotion } from './ocean';
import type { DamageSystem, VoyagePhase, VoyageState, HelmInput } from './types';

const phaseOrder: VoyagePhase[] = [
  'moored',
  'preparation',
  'departure',
  'open-sea',
  'approach',
  'docked',
];

const knotsToMps = 0.514444;
const gravity = 9.81;

/** Ahead speed the telegraph can ask for in each phase, in knots. */
const phaseSpeedCap: Record<VoyagePhase, number> = {
  moored: 0,
  preparation: 6,
  departure: 14,
  'open-sea': 22,
  approach: 10,
  docked: 0,
  foundered: 0,
};

/** Astern power is a fraction of ahead power on a real screw. */
const asternFraction = 0.35;
/** Degrees per second at full rudder with full steerage way. */
const maxRateOfTurn = 4.5;
/** Below this speed the rudder has nothing to bite on. */
const steerageSpeed = 6;
/** Degrees of heel at full rate of turn. A ship heels away from the turn. */
const maxHeel = 9;

export function createVoyageState(): VoyageState {
  return {
    phase: 'moored',
    phaseElapsed: 0,
    clock: 0,
    speed: 0,
    heading: 82,
    rudder: 0,
    telegraph: 0,
    rateOfTurn: 0,
    pitch: 0,
    roll: 0,
    turbulence: 0,
    airPocket: 0,
    turnImpulse: 0,
    collisionImpulse: 0,
    electrical: 1,
    hydraulics: 1,
    structure: 1,
    cabinAcceleration: { x: 0, y: 0 },
    sea: createSeaState(),
    hull: createHullMotion(),
  };
}

export function updateVoyage(
  current: VoyageState,
  input: HelmInput,
  deltaSeconds: number,
): VoyageState {
  const dt = clamp(finite(deltaSeconds), 0, 0.05);
  const phase = current.phase;
  const stop = input.emergencyStop;

  // The wheel and the telegraph hold their position; the helm only moves them.
  const rudder = clamp(current.rudder + clamp(finite(input.rudder), -1, 1) * dt * 0.55, -1, 1);
  const telegraph = stop
    ? 0
    : clamp(current.telegraph + clamp(finite(input.telegraph), -1, 1) * dt * 0.35, -1, 1);

  const engineHealth = 0.55 + current.structure * 0.45;
  const cap = phaseSpeedCap[phase];
  const commandedSpeed =
    telegraph >= 0
      ? telegraph * cap * engineHealth
      : telegraph * cap * asternFraction * engineHealth;
  // There are no brakes at sea: a ship sheds way far more slowly than it builds
  // it, and only a crash stop closes that gap.
  const responseRate = stop
    ? 0.3
    : Math.abs(commandedSpeed) > Math.abs(current.speed)
      ? 0.09
      : 0.032;
  const speed = clamp(current.speed + (commandedSpeed - current.speed) * responseRate * dt, -8, 26);
  const nextPhase = autoVoyagePhase(phase, telegraph, speed);

  // Turning radius is emergent, not authored: a ship with no way on cannot
  // steer, and sternway reverses which way the bow swings.
  const way = clamp(speed / steerageSpeed, -1, 1);
  const targetRateOfTurn = rudder * maxRateOfTurn * way;
  const rateOfTurn = clamp(
    current.rateOfTurn + (targetRateOfTurn - current.rateOfTurn) * dt * 0.9,
    -maxRateOfTurn,
    maxRateOfTurn,
  );
  const heading = (((current.heading + rateOfTurn * dt) % 360) + 360) % 360;

  const surge = ((speed - current.speed) / (dt || 1)) * knotsToMps;
  const targetPitch = clamp(surge * 2.4, -8, 8);
  const pitch = clamp(current.pitch + (targetPitch - current.pitch) * dt * 1.4, -18, 18);
  const targetRoll = -(rateOfTurn / maxRateOfTurn) * maxHeel * clamp(Math.abs(speed) / 12, 0, 1);
  const roll = clamp(current.roll + (targetRoll - current.roll) * dt * 1.1, -35, 35);

  const turbulence = clamp(current.turbulence - dt * 0.035, 0, 1);
  const airPocket = clamp(current.airPocket - dt, 0, 1);
  const turnImpulse = clamp(current.turnImpulse - dt * 1.4, 0, 1);
  const collisionImpulse = clamp(current.collisionImpulse - dt * 2.5, 0, 1);

  const clock = current.clock + dt;
  // The hull holds the origin, so headway is recorded as the water sliding
  // beneath it.
  const sea = advanceSea(current.sea, heading, speed * knotsToMps, dt);
  const hull = sampleHullMotion(sea, heading, clock);

  // Vertical deck acceleration is the second difference of heave. Sampling the
  // wave function at three times is stateless and therefore deterministic; the
  // alternative is carrying two more history fields in the snapshot.
  const previousHeave = sampleHullMotion(sea, heading, clock - dt).heave;
  const olderHeave = sampleHullMotion(sea, heading, clock - dt * 2).heave;
  const heaveAcceleration = dt > 0 ? (hull.heave - 2 * previousHeave + olderHeave) / (dt * dt) : 0;

  const omega = (rateOfTurn * Math.PI) / 180;
  const throughWater = speed * knotsToMps;
  // Centripetal throw plus the gravity component of every deck tilt: steering
  // heel, wave roll and wave pitch all slide loose objects the same way a
  // scripted impulse would, so they go through the same channel.
  const lateral =
    -throughWater * omega +
    gravity * Math.sin((roll * Math.PI) / 180) +
    gravity * Math.sin(hull.roll) +
    turnImpulse * 8;
  const longitudinal =
    surge +
    gravity * Math.sin((pitch * Math.PI) / 180) +
    gravity * Math.sin(hull.pitch) +
    collisionImpulse * 14;
  const vertical = heaveAcceleration + airPocket * 10 + turbulence * 4.4;

  return {
    ...current,
    phase: nextPhase,
    phaseElapsed: nextPhase === phase ? current.phaseElapsed + dt : 0,
    clock,
    speed,
    heading,
    rudder,
    telegraph,
    rateOfTurn,
    pitch,
    roll,
    turbulence,
    airPocket,
    turnImpulse,
    collisionImpulse,
    sea,
    hull,
    warning: nextPhase === phase ? current.warning : phaseMessage(nextPhase),
    cabinAcceleration: {
      x: clamp(finite(lateral), -24, 24),
      y: clamp(finite(longitudinal + vertical), -24, 24),
    },
  };
}

function autoVoyagePhase(phase: VoyagePhase, telegraph: number, speed: number): VoyagePhase {
  if (phase === 'moored' && telegraph >= 0.1) return 'preparation';
  if (phase === 'preparation' && speed >= 2) return 'departure';
  if (phase === 'departure' && speed >= 12) return 'open-sea';
  return phase;
}

function phaseMessage(phase: VoyagePhase): string {
  if (phase === 'preparation') return 'Lines singled up - stand by to get under way';
  if (phase === 'departure') return 'Under way - making way from the berth';
  if (phase === 'open-sea') return 'Open sea - steady as she goes';
  return `Phase: ${phase}`;
}

export function advanceVoyagePhase(current: VoyageState): VoyageState {
  if (current.phase === 'foundered' || current.phase === 'docked') return current;
  const index = phaseOrder.indexOf(current.phase);
  const next = phaseOrder[index + 1];
  if (!next) return current;
  const presets: Record<VoyagePhase, Pick<VoyageState, 'speed' | 'telegraph'>> = {
    moored: { speed: 0, telegraph: 0 },
    preparation: { speed: 0, telegraph: 0.12 },
    departure: { speed: 8, telegraph: 0.55 },
    'open-sea': { speed: 19, telegraph: 0.82 },
    approach: { speed: 7, telegraph: 0.3 },
    docked: { speed: 0, telegraph: 0 },
    foundered: { speed: 0, telegraph: 0 },
  };
  return { ...current, ...presets[next], phase: next, phaseElapsed: 0, warning: undefined };
}

export function triggerTurbulence(current: VoyageState, severity: number): VoyageState {
  const turbulence = clamp(severity, 0.1, 1);
  return { ...current, turbulence, warning: `Heavy weather ${Math.round(turbulence * 100)}%` };
}

export function triggerAirPocket(current: VoyageState): VoyageState {
  return { ...current, airPocket: 1, warning: 'Rogue wave: brace now' };
}

export function triggerSharpTurn(current: VoyageState): VoyageState {
  return {
    ...current,
    turnImpulse: 1,
    roll: clamp(current.roll + 26, -35, 35),
    warning: 'Hard over: the deck is heeling',
  };
}

export function triggerCollision(current: VoyageState): VoyageState {
  return {
    ...current,
    collisionImpulse: 1,
    structure: clamp(current.structure - 0.08, 0, 1),
    warning: 'Hull impact: inspect the decks',
  };
}

export function damageSystem(current: VoyageState, system: DamageSystem): VoyageState {
  const damage = 0.24;
  if (system === 'electrical')
    return {
      ...current,
      electrical: clamp(current.electrical - damage, 0, 1),
      warning: 'Electrical bus degraded',
    };
  if (system === 'hydraulics')
    return {
      ...current,
      hydraulics: clamp(current.hydraulics - damage, 0, 1),
      warning: 'Steering hydraulics degraded',
    };
  return {
    ...current,
    structure: clamp(current.structure - damage, 0, 1),
    warning: 'Structural condition degraded',
  };
}
