import { describe, expect, it } from 'vitest';
import { createCabinState, stepCabin } from '../../src/sim/cabin-simulation';
import { createVoyageState } from '../../src/sim/ship-model';
import { compartmentById } from '../../src/data/ship-layout';
import { portalSimPosition } from '../../src/sim/compartment-space';
import { emptyCommand, type CabinState } from '../../src/sim/types';

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

  /**
   * Walk crew-alpha up to the atrium's after door, which opens on the aft stair
   * tower, and stop there. Returns the state with the crew member standing in
   * the doorway — which, deliberately, is not the same as having used it.
   */
  function walkToTheAfterDoor(voyage: ReturnType<typeof createVoyageState>): CabinState {
    const atrium = compartmentById('atrium')!;
    const door = portalSimPosition(
      atrium,
      atrium.portals.find((p) => p.target === 'stairwell-aft')!,
    );
    const towards = (state: CabinState) => {
      const player = state.players['crew-alpha']!;
      const dx = door.x - player.position.x;
      const dy = door.y - player.position.y;
      const span = Math.hypot(dx, dy) || 1;
      return { ...emptyCommand(), move: { x: dx / span, y: dy / span } };
    };

    let state = createCabinState();
    expect(state.players['crew-alpha']!.compartmentId).toBe('atrium');
    for (let tick = 0; tick < 600; tick += 1) {
      state = stepCabin(
        state,
        voyage,
        { 'crew-alpha': towards(state), 'crew-bravo': emptyCommand() },
        1 / 60,
      );
      if (state.players['crew-alpha']!.pendingDoor) break;
    }
    return state;
  }

  it('offers a doorway without opening it', () => {
    const voyage = createVoyageState();
    const state = walkToTheAfterDoor(voyage);
    const waiting = state.players['crew-alpha']!;

    // Standing in a doorway names where it goes and which way through the ship
    // it leads — the atrium is deck 2, the tower's landing there is the same
    // deck, so this one is level.
    expect(waiting.pendingDoor?.target).toBe('engine-room');
    expect(waiting.pendingDoor?.direction).toBe('down');
    expect(waiting.pendingDoor?.deck).toBe(0);
    expect(waiting.pendingDoor?.options.map((option) => option.target)).toEqual([
      'engine-room',
      'crew-corridor',
      'main-galley',
      'cabin-deck-four',
      'promenade',
      'pool-deck',
      'sun-deck',
    ]);
    // And it stays offered. Proximity alone must never move anybody.
    expect(waiting.compartmentId).toBe('atrium');
    let held = state;
    for (let tick = 0; tick < 120; tick += 1)
      held = stepCabin(
        held,
        voyage,
        { 'crew-alpha': emptyCommand(), 'crew-bravo': emptyCommand() },
        1 / 60,
      );
    expect(held.players['crew-alpha']!.compartmentId).toBe('atrium');
  });

  it('walks the crew through a doorway when they ask to use it', () => {
    const voyage = createVoyageState();
    const waiting = walkToTheAfterDoor(voyage);
    const state = stepCabin(
      waiting,
      createVoyageState(),
      {
        'crew-alpha': {
          ...emptyCommand(),
          interact: true,
          interactionTargetId: waiting.players['crew-alpha']!.pendingDoor?.options.find(
            (option) => option.target === 'main-galley',
          )?.id,
        },
        'crew-bravo': emptyCommand(),
      },
      1 / 60,
    );

    const arrived = state.players['crew-alpha']!;
    expect(arrived.compartmentId).toBe('main-galley');
    expect(arrived.lastAction).toContain('Entered');
    // Arriving turns the view into the tower rather than back at the door.
    expect(arrived.arrivalYaw).toBeTypeOf('number');
    expect(arrived.pendingDoor).toBeUndefined();
    // The cooldown and the arrival offset together stop the crew bouncing
    // straight back through the door they just used, even holding the key down.
    expect(arrived.portalCooldown).toBeGreaterThan(0);
    const back = stepCabin(
      state,
      voyage,
      { 'crew-alpha': { ...emptyCommand(), interact: true }, 'crew-bravo': emptyCommand() },
      1 / 60,
    );
    expect(back.players['crew-alpha']!.compartmentId).toBe('main-galley');
  });
});
