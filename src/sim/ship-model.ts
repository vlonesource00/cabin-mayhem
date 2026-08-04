import { clamp, finite } from './math';
import type { DamageSystem, VoyagePhase, VoyageState, HelmInput } from './types';

const phaseOrder: VoyagePhase[] = ['ground', 'taxi', 'takeoff', 'cruise', 'approach', 'landed'];

export function createVoyageState(): VoyageState {
  return {
    phase: 'ground',
    phaseElapsed: 0,
    clock: 0,
    airspeed: 0,
    altitude: 0,
    verticalSpeed: 0,
    heading: 82,
    pitch: 0,
    roll: 0,
    yawRate: 0,
    throttle: 0,
    turbulence: 0,
    airPocket: 0,
    turnImpulse: 0,
    collisionImpulse: 0,
    electrical: 1,
    hydraulics: 1,
    structure: 1,
    cabinAcceleration: { x: 0, y: 0 },
  };
}

export function updateVoyage(
  current: VoyageState,
  input: HelmInput,
  deltaSeconds: number,
): VoyageState {
  const dt = clamp(finite(deltaSeconds), 0, 0.05);
  const phase = current.phase;
  const throttle = clamp(current.throttle + clamp(input.throttle, -1, 1) * dt * 0.42, 0, 1);
  const braking = input.brake ? 1 : 0;
  const engineHealth = 0.55 + current.structure * 0.45;
  const targetSpeed =
    phase === 'ground'
      ? throttle * 48 * engineHealth
      : phase === 'taxi'
        ? throttle * 104 * engineHealth
        : phase === 'approach'
          ? throttle * 176 * engineHealth
          : throttle * 220 * engineHealth;
  const brakeForce = braking * 170;
  const airspeed = clamp(
    current.airspeed + (targetSpeed - current.airspeed) * dt * 0.75 - brakeForce * dt,
    0,
    260,
  );
  const nextPhase = autoVoyagePhase(phase, throttle, airspeed, current.altitude);
  const rotationAssist = nextPhase === 'takeoff' && airspeed >= 96 && throttle >= 0.58 ? 8.5 : 0;
  const roll = clamp(
    current.roll + clamp(input.roll, -1, 1) * dt * 30 - current.roll * dt * 0.65,
    -35,
    35,
  );
  const pitch = clamp(
    current.pitch + (clamp(input.pitch, -1, 1) * 15 + rotationAssist - current.pitch * 0.42) * dt,
    -18,
    18,
  );
  const yawRate = clamp(input.yaw * 0.3 + roll * 0.024, -1.2, 1.2);
  const heading = (current.heading + yawRate * dt * 40 + 360) % 360;
  const canClimb = nextPhase === 'takeoff' || nextPhase === 'cruise' || nextPhase === 'approach';
  const verticalSpeed = canClimb
    ? clamp(pitch * airspeed * 0.012 - (nextPhase === 'approach' ? 3 : 0), -16, 16)
    : 0;
  const altitude = clamp(current.altitude + verticalSpeed * dt, 0, 12000);
  const turbulence = clamp(current.turbulence - dt * 0.035, 0, 1);
  const airPocket = clamp(current.airPocket - dt, 0, 1);
  const turnImpulse = clamp(current.turnImpulse - dt * 1.4, 0, 1);
  const collisionImpulse = clamp(current.collisionImpulse - dt * 2.5, 0, 1);
  const lateral = -(roll / 35) * (1.8 + airspeed * 0.008) + turnImpulse * 8;
  const longitudinal = (targetSpeed - airspeed) * 0.028 + collisionImpulse * 14;
  const vertical = airPocket * 10 + turbulence * 4.4;

  return {
    ...current,
    phase: nextPhase,
    phaseElapsed: nextPhase === phase ? current.phaseElapsed + dt : 0,
    clock: current.clock + dt,
    airspeed,
    altitude,
    verticalSpeed,
    heading,
    pitch,
    roll,
    yawRate,
    throttle,
    turbulence,
    airPocket,
    turnImpulse,
    collisionImpulse,
    warning: nextPhase === phase ? current.warning : phaseMessage(nextPhase),
    cabinAcceleration: { x: finite(lateral), y: finite(longitudinal + vertical) },
  };
}

function autoVoyagePhase(
  phase: VoyagePhase,
  throttle: number,
  airspeed: number,
  altitude: number,
): VoyagePhase {
  if (phase === 'ground' && throttle >= 0.1 && airspeed >= 4) return 'taxi';
  if (phase === 'taxi' && throttle >= 0.62 && airspeed >= 64) return 'takeoff';
  if (phase === 'takeoff' && altitude >= 900) return 'cruise';
  return phase;
}

function phaseMessage(phase: VoyagePhase): string {
  if (phase === 'taxi') return 'Taxi rolling - hold R for takeoff power';
  if (phase === 'takeoff') return 'V1 - rotate assist engaged';
  if (phase === 'cruise') return 'Cruise altitude captured';
  return `Phase: ${phase}`;
}

export function advanceVoyagePhase(current: VoyageState): VoyageState {
  if (current.phase === 'crashed' || current.phase === 'landed') return current;
  const index = phaseOrder.indexOf(current.phase);
  const next = phaseOrder[index + 1];
  if (!next) return current;
  const presets: Record<VoyagePhase, Pick<VoyageState, 'airspeed' | 'altitude' | 'throttle'>> = {
    ground: { airspeed: 0, altitude: 0, throttle: 0 },
    taxi: { airspeed: 18, altitude: 0, throttle: 0.22 },
    takeoff: { airspeed: 142, altitude: 700, throttle: 0.82 },
    cruise: { airspeed: 196, altitude: 6500, throttle: 0.67 },
    approach: { airspeed: 148, altitude: 900, throttle: 0.36 },
    landed: { airspeed: 0, altitude: 0, throttle: 0 },
    crashed: { airspeed: 0, altitude: 0, throttle: 0 },
  };
  return { ...current, ...presets[next], phase: next, phaseElapsed: 0, warning: undefined };
}

export function triggerTurbulence(current: VoyageState, severity: number): VoyageState {
  const turbulence = clamp(severity, 0.1, 1);
  return { ...current, turbulence, warning: `Turbulence ${Math.round(turbulence * 100)}%` };
}

export function triggerAirPocket(current: VoyageState): VoyageState {
  return { ...current, airPocket: 1, warning: 'Air pocket: brace now' };
}

export function triggerSharpTurn(current: VoyageState): VoyageState {
  return {
    ...current,
    turnImpulse: 1,
    roll: clamp(current.roll + 26, -35, 35),
    warning: 'Sharp turn impulse',
  };
}

export function triggerCollision(current: VoyageState): VoyageState {
  return {
    ...current,
    collisionImpulse: 1,
    structure: clamp(current.structure - 0.08, 0, 1),
    warning: 'Collision impulse: inspect cabin',
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
      warning: 'Hydraulics degraded',
    };
  return {
    ...current,
    structure: clamp(current.structure - damage, 0, 1),
    warning: 'Structural condition degraded',
  };
}
