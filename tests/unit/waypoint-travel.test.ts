import { describe, expect, it } from 'vitest';
import { waypointMap, waypointMapSchema, validateWaypointMap } from '../../src/data/waypoints';
import { createCabinState, stepCabin } from '../../src/sim/cabin-simulation';
import {
  buildWaypointRoute,
  setWaypointRequest,
  startWaypointTravel,
  waypointTravelFor,
} from '../../src/sim/waypoint-travel';
import { createVoyageState } from '../../src/sim/ship-model';
import { emptyCommand } from '../../src/sim/types';

describe('waypoint travel', () => {
  it('validates named destinations and the Grand Atrium elevator stops', () => {
    expect(waypointMapSchema.safeParse(waypointMap).success).toBe(true);
    expect(validateWaypointMap(waypointMap).elevators[0]?.servicedDecks).toEqual([2, 3, 4, 5]);
    expect(waypointMap.waypoints.map((waypoint) => waypoint.compartmentId)).toEqual(
      expect.arrayContaining([
        'engine-room',
        'crew-corridor',
        'main-galley',
        'atrium',
        'dining-room',
        'cabin-deck-four',
        'promenade',
        'cabin-deck-seven',
        'pool-deck',
        'sun-deck',
        'bridge',
      ]),
    );
  });

  it('builds a deterministic same-deck route without an elevator shortcut', () => {
    const player = createCabinState().players['crew-alpha']!;
    const first = buildWaypointRoute(player, 'grand-atrium', { authority: 'host' });
    const second = buildWaypointRoute(player, 'grand-atrium', { authority: 'host' });

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.route.legs.some((leg) => leg.kind === 'elevator')).toBe(false);
    expect(first.route.legs.some((leg) => leg.kind === 'walk')).toBe(true);
  });

  it('uses the Grand Atrium elevator as a bounded deck transition', () => {
    const player = createCabinState().players['crew-alpha']!;
    const route = buildWaypointRoute(player, 'atrium-gallery-deck-4', { authority: 'host' });
    expect(route.ok).toBe(true);
    if (!route.ok) return;
    expect(route.route.legs.some((leg) => leg.kind === 'elevator')).toBe(true);

    const started = startWaypointTravel(player, 'atrium-gallery-deck-4', { authority: 'host' });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(waypointTravelFor(started.player)?.status).toBe('walking');
    expect(started.player.compartmentId).toBe('atrium');

    const oneTick = stepCabin(
      {
        ...createCabinState(),
        players: { ...createCabinState().players, 'crew-alpha': started.player },
      },
      createVoyageState(),
      { 'crew-alpha': emptyCommand(), 'crew-bravo': emptyCommand() },
      1 / 60,
    );
    expect(waypointTravelFor(oneTick.players['crew-alpha']!)).toBeDefined();

    const arrived = runToArrival(started.player, 'atrium-gallery-deck-4');
    expect(arrived.compartmentId).toBe('atrium');
    expect((arrived as typeof arrived & { waypointDeck?: number }).waypointDeck).toBe(4);
    expect(arrived.lastAction).toContain('Arrived at');
  });

  it('rejects client authority, active door transitions, and blocked routes', () => {
    const player = createCabinState().players['crew-alpha']!;
    expect(startWaypointTravel(player, 'bridge', { authority: 'client' })).toEqual({
      ok: false,
      reason: 'HOST AUTHORITY REQUIRED',
    });

    const busy = startWaypointTravel({ ...player, portalCooldown: 0.4 }, 'bridge', {
      authority: 'host',
    });
    expect(busy).toEqual({ ok: false, reason: 'DOOR TRANSITION BUSY' });

    const blocked = buildWaypointRoute(player, 'bridge', {
      authority: 'host',
      blockedPortalKeys: ['atrium->stairwell-aft', 'atrium->stairwell-mid'],
    });
    expect(blocked).toEqual({ ok: false, reason: 'NO UNBLOCKED ROUTE' });

    const collisionBlocked = buildWaypointRoute(player, 'grand-atrium', {
      authority: 'host',
      canWalk: () => false,
    });
    expect(collisionBlocked).toEqual({
      ok: false,
      reason: 'BLOCKED WALK IN ATRIUM',
    });
  });

  it('completes a representative cross-deck route through doors and stairs', () => {
    const arrived = runToArrival(createCabinState().players['crew-alpha']!, 'bridge');
    expect(arrived.compartmentId).toBe('bridge');
    expect((arrived as typeof arrived & { waypointDeck?: number }).waypointDeck).toBe(9);
    expect(arrived.lastAction).toContain('Arrived at Navigating Bridge');
  });
});

function runToArrival(
  player: ReturnType<typeof createCabinState>['players']['crew-alpha'],
  targetId: string,
) {
  if (!player) throw new Error('Test player missing');
  const command = emptyCommand();
  setWaypointRequest(command, targetId);
  let current = player;
  const voyage = createVoyageState();

  for (let tick = 0; tick < 3600; tick += 1) {
    const step = stepCabin(
      {
        ...createCabinState(),
        players: {
          ...createCabinState().players,
          'crew-alpha': current,
        },
      },
      voyage,
      { 'crew-alpha': tick === 0 ? command : emptyCommand(), 'crew-bravo': emptyCommand() },
      1 / 60,
    );
    current = step.players['crew-alpha']!;
    if (current.lastAction.startsWith('Arrived at ')) return current;
  }
  throw new Error(`Waypoint ${targetId} did not arrive within the test budget`);
}
