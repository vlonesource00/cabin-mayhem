import { describe, expect, it } from 'vitest';
import {
  advanceVoyagePhase,
  createVoyageState,
  triggerAirPocket,
  triggerTurbulence,
  updateVoyage,
} from '../../src/sim/ship-model';

describe('ship model', () => {
  it('uses explicit valid phase progression and terminal landing', () => {
    let voyage = createVoyageState();
    for (const phase of ['taxi', 'takeoff', 'cruise', 'approach', 'landed']) {
      voyage = advanceVoyagePhase(voyage);
      expect(voyage.phase).toBe(phase);
    }
    expect(advanceVoyagePhase(voyage)).toEqual(voyage);
  });

  it('taxis, rotates and climbs from helm throttle without debug phase skips', () => {
    let voyage = createVoyageState();
    for (let tick = 0; tick < 720; tick += 1) {
      voyage = updateVoyage(
        voyage,
        { pitch: 0, roll: 0, yaw: 0, throttle: 1, brake: false },
        1 / 60,
      );
    }
    expect(['takeoff', 'cruise']).toContain(voyage.phase);
    expect(voyage.airspeed).toBeGreaterThan(95);
    expect(voyage.altitude).toBeGreaterThan(10);
  });

  it('stays finite under sustained helm input and turbulence', () => {
    let voyage = triggerAirPocket(triggerTurbulence(createVoyageState(), 1));
    voyage = advanceVoyagePhase(voyage);
    voyage = advanceVoyagePhase(voyage);
    for (let tick = 0; tick < 1200; tick += 1) {
      voyage = updateVoyage(
        voyage,
        {
          pitch: Math.sin(tick / 19),
          roll: Math.cos(tick / 13),
          yaw: 0.25,
          throttle: 0.3,
          brake: false,
        },
        1 / 60,
      );
    }
    for (const value of Object.values(voyage).filter(
      (entry): entry is number => typeof entry === 'number',
    )) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(Math.abs(voyage.roll)).toBeLessThanOrEqual(35);
  });
});
