import { describe, expect, it } from 'vitest';

import {
  advanceSea,
  calmSwell,
  createSeaState,
  hullHalfBeam,
  hullHalfLength,
  maxWaveHeight,
  oceanWaveGlsl,
  oceanWaves,
  sampleHullMotion,
  seaHeight,
  seaHeightUnderHull,
} from '../../src/sim/ocean';

const calm = createSeaState();

describe('sea surface', () => {
  it('is deterministic for the same point and time', () => {
    const a = seaHeight({ x: 12.5, y: -40 }, 9.25, calmSwell);
    const b = seaHeight({ x: 12.5, y: -40 }, 9.25, calmSwell);
    expect(a).toBe(b);
  });

  it('never exceeds the summed amplitude of the wave table', () => {
    for (let time = 0; time < 40; time += 0.37)
      for (let x = -180; x <= 180; x += 23)
        for (let z = -180; z <= 180; z += 29)
          expect(Math.abs(seaHeight({ x, y: z }, time, 1))).toBeLessThanOrEqual(maxWaveHeight);
  });

  it('scales with swell and flattens at zero', () => {
    const point = { x: 7, y: 31 };
    const high = seaHeight(point, 4, 1);
    expect(seaHeight(point, 4, 0.5)).toBeCloseTo(high * 0.5, 10);
    expect(seaHeight(point, 4, 0)).toBe(0);
  });

  it('moves over time', () => {
    const point = { x: 3, y: 3 };
    expect(seaHeight(point, 0, 1)).not.toBeCloseTo(seaHeight(point, 6, 1), 3);
  });

  it('rejects non-finite input rather than propagating NaN', () => {
    expect(seaHeight({ x: Number.NaN, y: 0 }, 1, 1)).not.toBeNaN();
    expect(seaHeight({ x: 0, y: 0 }, Number.POSITIVE_INFINITY, 1)).not.toBeNaN();
    expect(seaHeight({ x: 0, y: 0 }, 1, Number.NaN)).toBe(0);
  });
});

describe('sea drift', () => {
  it('starts still and calm', () => {
    expect(calm.drift).toEqual({ x: 0, y: 0 });
    expect(calm.swell).toBe(calmSwell);
  });

  it('advances the water beneath a stationary hull', () => {
    const moved = advanceSea(calm, 0, 20, 0.05);
    // Heading 0 is north, which is +z in the cabin frame.
    expect(moved.drift.y).toBeCloseTo(1, 6);
    expect(moved.drift.x).toBeCloseTo(0, 6);
  });

  it('follows heading', () => {
    const east = advanceSea(calm, 90, 20, 0.05);
    expect(east.drift.x).toBeCloseTo(1, 6);
    expect(east.drift.y).toBeCloseTo(0, 6);
  });

  it('does not drift while stopped', () => {
    expect(advanceSea(calm, 42, 0, 0.05).drift).toEqual({ x: 0, y: 0 });
  });

  it('clamps the step the same way the simulation does', () => {
    const huge = advanceSea(calm, 0, 20, 10);
    const clamped = advanceSea(calm, 0, 20, 0.05);
    expect(huge.drift.y).toBeCloseTo(clamped.drift.y, 10);
  });

  it('keeps drift finite across a long voyage', () => {
    let sea = calm;
    for (let step = 0; step < 20000; step += 1) sea = advanceSea(sea, 33, 12, 0.05);
    expect(Number.isFinite(sea.drift.x)).toBe(true);
    expect(Number.isFinite(sea.drift.y)).toBe(true);
    expect(Math.abs(sea.drift.y)).toBeLessThan(1e6);
  });
});

describe('hull motion', () => {
  it('is flat on a dead-calm sea', () => {
    const motion = sampleHullMotion({ drift: { x: 0, y: 0 }, swell: 0 }, 0, 12);
    expect(motion.pitch).toBeCloseTo(0, 12);
    expect(motion.roll).toBeCloseTo(0, 12);
    expect(motion.heave).toBeCloseTo(0, 12);
  });

  it('stays finite and clamped through a long swell sweep', () => {
    for (let time = 0; time < 120; time += 0.29) {
      const motion = sampleHullMotion({ drift: { x: time * 4, y: time * 9 }, swell: 3 }, 61, time);
      expect(Number.isFinite(motion.pitch)).toBe(true);
      expect(Number.isFinite(motion.roll)).toBe(true);
      expect(Number.isFinite(motion.heave)).toBe(true);
      expect(Math.abs(motion.pitch)).toBeLessThanOrEqual(0.28);
      expect(Math.abs(motion.roll)).toBeLessThanOrEqual(0.28);
      expect(Math.abs(motion.heave)).toBeLessThanOrEqual(maxWaveHeight);
    }
  });

  it('is derived from the same surface the sample points sit on', () => {
    const sea = { drift: { x: 18, y: -5 }, swell: 1 };
    const bow = seaHeightUnderHull({ x: 0, y: hullHalfLength }, sea, 25, 8);
    const stern = seaHeightUnderHull({ x: 0, y: -hullHalfLength }, sea, 25, 8);
    const starboard = seaHeightUnderHull({ x: hullHalfBeam, y: 0 }, sea, 25, 8);
    const port = seaHeightUnderHull({ x: -hullHalfBeam, y: 0 }, sea, 25, 8);
    const motion = sampleHullMotion(sea, 25, 8);
    expect(motion.pitch).toBeCloseTo(Math.atan2(bow - stern, hullHalfLength * 2) * 0.5, 12);
    expect(motion.roll).toBeCloseTo(Math.atan2(starboard - port, hullHalfBeam * 2) * 0.5, 12);
    expect(motion.heave).toBeCloseTo((bow + stern + starboard + port) * 0.25, 12);
  });

  it('actually moves as the ship makes way', () => {
    let sea = createSeaState();
    const heave: number[] = [];
    for (let step = 0; step < 400; step += 1) {
      sea = advanceSea(sea, 0, 9, 0.05);
      heave.push(sampleHullMotion(sea, 0, step * 0.05).heave);
    }
    expect(Math.max(...heave) - Math.min(...heave)).toBeGreaterThan(0.05);
  });
});

describe('generated shader', () => {
  it('emits one term per authored wave', () => {
    const glsl = oceanWaveGlsl();
    expect(glsl.match(/sin\(/g)).toHaveLength(oceanWaves.length);
  });

  it('carries the same constants the simulation uses', () => {
    const glsl = oceanWaveGlsl();
    for (const wave of oceanWaves) {
      const k = (Math.PI * 2) / wave.wavelength;
      expect(glsl).toContain(wave.amplitude.toFixed(6));
      expect(glsl).toContain(k.toFixed(6));
      expect(glsl).toContain((wave.speed * k).toFixed(6));
    }
  });

  it('declares the function the vertex shader calls and clamps swell the same way', () => {
    const glsl = oceanWaveGlsl();
    expect(glsl).toContain('float cmSeaHeight(vec2 p, float t, float swell)');
    expect(glsl).toContain('clamp(swell, 0.0, 3.0)');
  });

  it('emits every constant as a float literal, so no term is integer-typed', () => {
    for (const term of oceanWaveGlsl()
      .split('\n')
      .filter((line) => line.includes('sin(')))
      for (const literal of term.replace(/vec2/g, '').match(/-?\d+(\.\d+)?/g) ?? [])
        expect(literal).toContain('.');
  });
});
