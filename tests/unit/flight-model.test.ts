import { describe, expect, it } from 'vitest';
import {
  advanceFlightPhase,
  createFlightState,
  triggerAirPocket,
  triggerTurbulence,
  updateFlight,
} from '../../src/sim/flight-model';

describe('flight model', () => {
  it('uses explicit valid phase progression and terminal landing', () => {
    let flight = createFlightState();
    for (const phase of ['taxi', 'takeoff', 'cruise', 'approach', 'landed']) {
      flight = advanceFlightPhase(flight);
      expect(flight.phase).toBe(phase);
    }
    expect(advanceFlightPhase(flight)).toEqual(flight);
  });

  it('taxis, rotates and climbs from pilot throttle without debug phase skips', () => {
    let flight = createFlightState();
    for (let tick = 0; tick < 720; tick += 1) {
      flight = updateFlight(
        flight,
        { pitch: 0, roll: 0, yaw: 0, throttle: 1, brake: false },
        1 / 60,
      );
    }
    expect(['takeoff', 'cruise']).toContain(flight.phase);
    expect(flight.airspeed).toBeGreaterThan(95);
    expect(flight.altitude).toBeGreaterThan(10);
  });

  it('stays finite under sustained pilot input and turbulence', () => {
    let flight = triggerAirPocket(triggerTurbulence(createFlightState(), 1));
    flight = advanceFlightPhase(flight);
    flight = advanceFlightPhase(flight);
    for (let tick = 0; tick < 1200; tick += 1) {
      flight = updateFlight(
        flight,
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
    for (const value of Object.values(flight).filter(
      (entry): entry is number => typeof entry === 'number',
    )) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(Math.abs(flight.roll)).toBeLessThanOrEqual(35);
  });
});
