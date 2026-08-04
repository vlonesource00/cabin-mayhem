import { describe, expect, it } from 'vitest';
import {
  advanceVoyagePhase,
  createVoyageState,
  triggerAirPocket,
  triggerTurbulence,
  updateVoyage,
} from '../../src/sim/ship-model';
import type { HelmInput, VoyageState } from '../../src/sim/types';

const idle: HelmInput = { rudder: 0, telegraph: 0, emergencyStop: false };
const helm = (overrides: Partial<HelmInput>): HelmInput => ({ ...idle, ...overrides });

function run(voyage: VoyageState, input: HelmInput, seconds: number): VoyageState {
  let next = voyage;
  for (let tick = 0; tick < Math.round(seconds * 60); tick += 1) {
    next = updateVoyage(next, input, 1 / 60);
  }
  return next;
}

describe('ship model', () => {
  it('uses explicit valid phase progression and terminal docking', () => {
    let voyage = createVoyageState();
    for (const phase of ['preparation', 'departure', 'open-sea', 'approach', 'docked']) {
      voyage = advanceVoyagePhase(voyage);
      expect(voyage.phase).toBe(phase);
    }
    expect(advanceVoyagePhase(voyage)).toEqual(voyage);
  });

  it('gets under way from the telegraph alone without debug phase skips', () => {
    const voyage = run(createVoyageState(), helm({ telegraph: 1 }), 180);
    expect(['departure', 'open-sea']).toContain(voyage.phase);
    expect(voyage.telegraph).toBe(1);
    expect(voyage.speed).toBeGreaterThan(10);
  });

  it('holds the wheel and the telegraph where the crew left them', () => {
    const moved = run(createVoyageState(), helm({ rudder: 1, telegraph: 1 }), 1);
    const released = run(moved, idle, 3);
    expect(released.rudder).toBeCloseTo(moved.rudder, 12);
    expect(released.telegraph).toBeCloseTo(moved.telegraph, 12);
  });

  it('cannot steer without steerage way, and heels outward once it has it', () => {
    const dead = run(createVoyageState(), helm({ rudder: 1 }), 6);
    expect(dead.rateOfTurn).toBeCloseTo(0, 6);

    const making = run(
      run(createVoyageState(), helm({ telegraph: 1 }), 180),
      helm({ rudder: 1 }),
      8,
    );
    // Starboard wheel swings the bow to starboard...
    expect(making.rateOfTurn).toBeGreaterThan(0.5);
    // ...and a ship lays over away from the turn, unlike an aircraft.
    expect(making.roll).toBeLessThan(-1);
  });

  it('sheds way far more slowly than it builds it, and a crash stop closes the gap', () => {
    const way = run(createVoyageState(), helm({ telegraph: 1 }), 180);
    const coasting = run(way, helm({ telegraph: -1 }), 20);
    const crash = run(way, helm({ telegraph: -1, emergencyStop: true }), 20);
    expect(crash.speed).toBeLessThan(coasting.speed);
    expect(crash.telegraph).toBe(0);
  });

  it('stays finite under sustained helm input and heavy weather', () => {
    let voyage = triggerAirPocket(triggerTurbulence(createVoyageState(), 1));
    voyage = advanceVoyagePhase(voyage);
    voyage = advanceVoyagePhase(voyage);
    for (let tick = 0; tick < 1200; tick += 1) {
      voyage = updateVoyage(
        voyage,
        { rudder: Math.sin(tick / 19), telegraph: Math.cos(tick / 13), emergencyStop: false },
        1 / 60,
      );
    }
    for (const value of Object.values(voyage).filter(
      (entry): entry is number => typeof entry === 'number',
    )) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(Math.abs(voyage.roll)).toBeLessThanOrEqual(35);
    expect(voyage.heading).toBeGreaterThanOrEqual(0);
    expect(voyage.heading).toBeLessThan(360);
  });
});
