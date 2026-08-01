import { clamp, finite } from './math';
import type { DamageSystem, FlightPhase, FlightState, PilotInput } from './types';

const phaseOrder: FlightPhase[] = ['ground', 'taxi', 'takeoff', 'cruise', 'approach', 'landed'];

export function createFlightState(): FlightState {
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

export function updateFlight(
  current: FlightState,
  input: PilotInput,
  deltaSeconds: number,
): FlightState {
  const dt = clamp(finite(deltaSeconds), 0, 0.05);
  const phase = current.phase;
  const moving =
    phase === 'taxi' || phase === 'takeoff' || phase === 'cruise' || phase === 'approach';
  const throttle = clamp(current.throttle + clamp(input.throttle, -1, 1) * dt * 0.42, 0, 1);
  const braking = input.brake ? 1 : 0;
  const engineHealth = 0.55 + current.structure * 0.45;
  const targetSpeed = moving ? throttle * 220 * engineHealth : 0;
  const brakeForce = braking * 170;
  const airspeed = clamp(
    current.airspeed + (targetSpeed - current.airspeed) * dt * 0.75 - brakeForce * dt,
    0,
    260,
  );
  const roll = clamp(
    current.roll + clamp(input.roll, -1, 1) * dt * 30 - current.roll * dt * 0.65,
    -35,
    35,
  );
  const pitch = clamp(
    current.pitch + clamp(input.pitch, -1, 1) * dt * 15 - current.pitch * dt * 0.42,
    -18,
    18,
  );
  const yawRate = clamp(input.yaw * 0.3 + roll * 0.024, -1.2, 1.2);
  const heading = (current.heading + yawRate * dt * 40 + 360) % 360;
  const canClimb = phase === 'takeoff' || phase === 'cruise' || phase === 'approach';
  const verticalSpeed = canClimb
    ? clamp(pitch * airspeed * 0.0024 - (phase === 'approach' ? 3 : 0), -16, 16)
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
    phaseElapsed: current.phaseElapsed + dt,
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
    cabinAcceleration: { x: finite(lateral), y: finite(longitudinal + vertical) },
  };
}

export function advanceFlightPhase(current: FlightState): FlightState {
  if (current.phase === 'crashed' || current.phase === 'landed') return current;
  const index = phaseOrder.indexOf(current.phase);
  const next = phaseOrder[index + 1];
  if (!next) return current;
  const presets: Record<FlightPhase, Pick<FlightState, 'airspeed' | 'altitude' | 'throttle'>> = {
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

export function triggerTurbulence(current: FlightState, severity: number): FlightState {
  const turbulence = clamp(severity, 0.1, 1);
  return { ...current, turbulence, warning: `Turbulence ${Math.round(turbulence * 100)}%` };
}

export function triggerAirPocket(current: FlightState): FlightState {
  return { ...current, airPocket: 1, warning: 'Air pocket: brace now' };
}

export function triggerSharpTurn(current: FlightState): FlightState {
  return {
    ...current,
    turnImpulse: 1,
    roll: clamp(current.roll + 26, -35, 35),
    warning: 'Sharp turn impulse',
  };
}

export function triggerCollision(current: FlightState): FlightState {
  return {
    ...current,
    collisionImpulse: 1,
    structure: clamp(current.structure - 0.08, 0, 1),
    warning: 'Collision impulse: inspect cabin',
  };
}

export function damageSystem(current: FlightState, system: DamageSystem): FlightState {
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
