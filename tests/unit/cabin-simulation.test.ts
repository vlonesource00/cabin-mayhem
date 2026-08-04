import { describe, expect, it } from 'vitest';
import { createCabinState, stepCabin } from '../../src/sim/cabin-simulation';
import { createVoyageState } from '../../src/sim/ship-model';
import { emptyCommand } from '../../src/sim/types';

describe('cabin simulation', () => {
  it('keeps secured crate on anchor while loose case receives aircraft force', () => {
    const cabin = createCabinState();
    const voyage = {
      ...createVoyageState(),
      cabinAcceleration: { x: 8, y: 4 },
      turbulence: 0.65,
      clock: 2,
    };
    const securedStart = { ...cabin.objects['crate-a']!.position };
    const looseStart = { ...cabin.objects['case-01']!.position };
    let next = cabin;
    for (let tick = 0; tick < 120; tick += 1) {
      next = stepCabin(
        next,
        { ...voyage, clock: tick / 60 },
        { 'crew-alpha': emptyCommand(), 'crew-bravo': emptyCommand() },
        1 / 60,
      );
    }
    expect(next.objects['crate-a']!.position).toEqual(securedStart);
    expect(next.objects['case-01']!.position).not.toEqual(looseStart);
    expect(next.collisionCount).toBeGreaterThanOrEqual(0);
  });

  it('keeps kinematic crew inside aircraft bounds during extreme impulse', () => {
    const cabin = createCabinState();
    const voyage = { ...createVoyageState(), cabinAcceleration: { x: 22, y: -18 } };
    const next = stepCabin(
      cabin,
      voyage,
      { 'crew-alpha': emptyCommand(), 'crew-bravo': emptyCommand() },
      0.05,
    );
    for (const player of Object.values(next.players)) {
      expect(player.position.x).toBeGreaterThan(0);
      expect(player.position.x).toBeLessThan(next.width);
      expect(player.position.y).toBeGreaterThan(0);
      expect(player.position.y).toBeLessThan(next.length);
    }
  });
});
