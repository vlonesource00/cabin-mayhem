import { clamp, finite } from './math';
import type { HullMotion, SeaState, Vec2 } from './types';

/**
 * One directional sine component of the sea surface.
 *
 * This table is the single source of truth for the water. The simulation
 * evaluates it in TypeScript to derive hull motion; the renderer displaces its
 * sea plane with GLSL generated from the same table by {@link oceanWaveGlsl}.
 * Neither side may hand-write its own copy — if they disagree, the hull rides a
 * different ocean than the one the player can see.
 */
export interface OceanWave {
  /** Metres from mean sea level to crest. */
  amplitude: number;
  /** Crest-to-crest distance in metres. */
  wavelength: number;
  /** Crest travel speed in metres per second. */
  speed: number;
  /** Unit direction of travel on the world XZ plane. */
  direction: Vec2;
  /** Fixed phase offset in radians, so the components never align at t = 0. */
  phase: number;
}

const tau = Math.PI * 2;

export const oceanWaves: readonly OceanWave[] = [
  { amplitude: 1.35, wavelength: 96, speed: 8.2, direction: { x: 1, y: 0.16 }, phase: 0 },
  { amplitude: 0.82, wavelength: 47, speed: 6.1, direction: { x: 0.72, y: -0.69 }, phase: 1.94 },
  { amplitude: 0.41, wavelength: 23, speed: 4.4, direction: { x: -0.34, y: 0.94 }, phase: 3.71 },
  { amplitude: 0.19, wavelength: 11, speed: 3.1, direction: { x: 0.88, y: 0.47 }, phase: 5.28 },
];

interface DerivedWave {
  amplitude: number;
  dirX: number;
  dirZ: number;
  /** Angular wavenumber, 2*pi / wavelength. */
  k: number;
  /** Angular frequency, speed * k. */
  omega: number;
  phase: number;
}

const derived: readonly DerivedWave[] = oceanWaves.map((wave) => {
  const magnitude = Math.hypot(wave.direction.x, wave.direction.y) || 1;
  const k = tau / wave.wavelength;
  return {
    amplitude: wave.amplitude,
    dirX: wave.direction.x / magnitude,
    dirZ: wave.direction.y / magnitude,
    k,
    omega: wave.speed * k,
    phase: wave.phase,
  };
});

/** Crest height with `swell` at 1. Every derived motion is bounded by this. */
export const maxWaveHeight = derived.reduce((sum, wave) => sum + wave.amplitude, 0);

/** Sea-state multiplier for a calm open-sea passage. */
export const calmSwell = 0.35;

/**
 * Height of the sea surface, in metres above mean sea level, at a point on the
 * world XZ plane.
 *
 * `point` is in world space with the ship drift already applied — see
 * {@link seaHeightUnderHull}, which is what callers normally want.
 */
export function seaHeight(point: Vec2, time: number, swell: number): number {
  const x = finite(point.x);
  const z = finite(point.y);
  const t = finite(time);
  let height = 0;
  for (const wave of derived)
    height +=
      wave.amplitude *
      Math.sin((x * wave.dirX + z * wave.dirZ) * wave.k + t * wave.omega + wave.phase);
  return height * clamp(finite(swell), 0, 3);
}

/**
 * GLSL for the identical function, generated from the same table.
 *
 * Injected into the sea-plane vertex shader. Keeping generation here is what
 * makes the two evaluations impossible to desynchronise by editing one side.
 */
export function oceanWaveGlsl(): string {
  const terms = derived.map(
    (wave) =>
      `  h += ${num(wave.amplitude)} * sin(dot(p, vec2(${num(wave.dirX)}, ${num(wave.dirZ)})) * ${num(wave.k)} + t * ${num(wave.omega)} + ${num(wave.phase)});`,
  );
  return [
    'float cmSeaHeight(vec2 p, float t, float swell) {',
    '  float h = 0.0;',
    ...terms,
    '  return h * clamp(swell, 0.0, 3.0);',
    '}',
  ].join('\n');
}

const num = (value: number): string => {
  const text = value.toFixed(6);
  return text.includes('.') ? text : `${text}.0`;
};

/**
 * Hull-local sample points, in metres, used to fit the hull to the surface.
 *
 * `x` is starboard-positive across the beam, `y` is bow-positive along the
 * keel. They straddle the hull so pitch reads bow against stern and roll reads
 * starboard against port.
 */
export const hullHalfLength = 11;
export const hullHalfBeam = 4.2;

export function createSeaState(): SeaState {
  return { drift: { x: 0, y: 0 }, swell: calmSwell };
}

/**
 * Advance the ocean under a hull that never translates.
 *
 * The ship holds the world origin, so forward motion is recorded as drift of
 * the water beneath it. `heading` is degrees clockwise from north and `speed`
 * is metres per second.
 */
export function advanceSea(
  current: SeaState,
  heading: number,
  speed: number,
  deltaSeconds: number,
): SeaState {
  const dt = clamp(finite(deltaSeconds), 0, 0.05);
  const radians = (finite(heading) * Math.PI) / 180;
  const travel = finite(speed) * dt;
  // Wrapped at the longest wavelength so drift stays small enough for float
  // precision on a voyage of any length, without moving the surface.
  const period = oceanWaves[0]?.wavelength ?? 1;
  const wrap = period * 4096;
  return {
    drift: {
      x: wrapTo(current.drift.x + Math.sin(radians) * travel, wrap),
      y: wrapTo(current.drift.y + Math.cos(radians) * travel, wrap),
    },
    swell: clamp(finite(current.swell), 0, 3),
  };
}

const wrapTo = (value: number, wrap: number): number => {
  const wrapped = finite(value) % wrap;
  return wrapped;
};

/** Sea height at a hull-local point, with drift and heading applied. */
export function seaHeightUnderHull(
  local: Vec2,
  sea: SeaState,
  heading: number,
  time: number,
): number {
  const radians = (finite(heading) * Math.PI) / 180;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  return seaHeight(
    {
      x: sea.drift.x + local.x * cos + local.y * sin,
      y: sea.drift.y - local.x * sin + local.y * cos,
    },
    time,
    sea.swell,
  );
}

export function createHullMotion(): HullMotion {
  return { pitch: 0, roll: 0, heave: 0 };
}

/**
 * Fit the hull to the surface it is sitting on.
 *
 * Four samples, not a full buoyancy solve: this is a game about walking around
 * inside the ship, and the deck only has to move plausibly. Pitch and roll are
 * returned in radians and clamped so a freak wave stack cannot flip the deck.
 */
export function sampleHullMotion(sea: SeaState, heading: number, time: number): HullMotion {
  const bow = seaHeightUnderHull({ x: 0, y: hullHalfLength }, sea, heading, time);
  const stern = seaHeightUnderHull({ x: 0, y: -hullHalfLength }, sea, heading, time);
  const starboard = seaHeightUnderHull({ x: hullHalfBeam, y: 0 }, sea, heading, time);
  const port = seaHeightUnderHull({ x: -hullHalfBeam, y: 0 }, sea, heading, time);
  // A real hull damps short chop rather than tracing it. Halving the fitted
  // angles is the cheapest stand-in until the motion model owns inertia.
  const pitch = clamp(Math.atan2(bow - stern, hullHalfLength * 2) * 0.5, -0.28, 0.28);
  const roll = clamp(Math.atan2(starboard - port, hullHalfBeam * 2) * 0.5, -0.28, 0.28);
  const heave = clamp((bow + stern + starboard + port) * 0.25, -maxWaveHeight, maxWaveHeight);
  return { pitch: finite(pitch), roll: finite(roll), heave: finite(heave) };
}
