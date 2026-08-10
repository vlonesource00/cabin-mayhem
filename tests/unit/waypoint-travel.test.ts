import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  grandAtriumElevator,
  validateWaypointMap,
  waypointMap,
  waypointMapSchema,
  waypointById,
} from '../../src/data/waypoints';
import { createCabinState, stepCabin } from '../../src/sim/cabin-simulation';
import { HostSession } from '../../src/sim/host-session';
import { createVoyageState } from '../../src/sim/ship-model';
import {
  PORTAL_PAD_REACH,
  doorPromptFor,
  nearbyPortalPad,
  portalPadDefinitionsFor,
  selectedDoorOption,
  waypointDeckFor,
  waypointDeckRenderOffset,
} from '../../src/sim/waypoint-travel';
import { emptyCommand, type CabinState, type PlayerCommand } from '../../src/sim/types';
import { WaypointPadPresenter } from '../../src/three/waypoint-pad-presenter';

describe('physical portal pads', () => {
  it('keeps named destination data valid for labels and elevator stops', () => {
    expect(waypointMapSchema.safeParse(waypointMap).success).toBe(true);
    expect(validateWaypointMap(waypointMap).elevators[0]?.servicedDecks).toEqual([2, 3, 4, 5]);
    expect(grandAtriumElevator.stops.map((stop) => stop.deck)).toEqual([2, 3, 4, 5]);
    expect(waypointById('grand-atrium-elevator')?.position).toEqual(
      grandAtriumElevator.stops[0]?.position,
    );
    expect(waypointById('grand-atrium-elevator')?.position).toEqual({ x: 12, y: 4.8 });
  });

  it('derives one stable floor pad for every authored portal', () => {
    const pads = portalPadDefinitionsFor('atrium');
    const doors = pads.filter((pad) => pad.kind === 'door');

    expect(doors).toHaveLength(2);
    expect(doors.map((pad) => pad.options.length)).toEqual([7, 5]);
    expect(new Set(doors.map((pad) => pad.id)).size).toBe(doors.length);
    expect(pads.find((pad) => pad.kind === 'elevator')).toMatchObject({
      id: 'elevator-pad:grand-atrium',
      position: { x: 12, y: 4.8 },
    });
  });

  it('offers a nearby pad without moving until E names a valid option', () => {
    const { cabin, pad } = cabinAtPad('door');
    const player = cabin.players['crew-alpha']!;
    const offered = stepCabin(
      cabin,
      createVoyageState(),
      { 'crew-alpha': emptyCommand(), 'crew-bravo': emptyCommand() },
      1 / 60,
    ).players['crew-alpha']!;

    expect(nearbyPortalPad(player, PORTAL_PAD_REACH)?.id).toBe(pad.id);
    expect(offered.pendingDoor?.padId).toBe(pad.id);
    expect(offered.compartmentId).toBe('atrium');
  });

  it('turns the atrium aft stair pad into seven authored real-compartment options', () => {
    const pad = portalPadDefinitionsFor('atrium').find(
      (candidate) => candidate.id === 'door-pad:atrium:stairwell-aft:0',
    );
    if (!pad) throw new Error('Aft stair pad missing');
    expect(pad.options.map((option) => option.target)).toEqual([
      'engine-room',
      'crew-corridor',
      'main-galley',
      'cabin-deck-four',
      'promenade',
      'pool-deck',
      'sun-deck',
    ]);
    expect(pad.options.map((option) => option.label)).toEqual([
      'Engine room',
      'Crew corridor',
      'Main galley',
      'Cabin deck four',
      'Promenade deck',
      'Lido pool deck',
      'Sun deck',
    ]);
    expect(pad.options.every((option) => option.target !== 'stairwell-aft')).toBe(true);

    const { cabin } = cabinAtPad('door');
    const selected = pad.options.find((option) => option.target === 'main-galley');
    if (!selected) throw new Error('Main galley option missing');
    const arrived = stepOnce(cabin, {
      ...emptyCommand(),
      interact: true,
      interactionTargetId: selected.id,
    }).players['crew-alpha']!;
    expect(arrived.compartmentId).toBe('main-galley');
    expect(arrived.waypointDeck).toBe(2);
    expect(arrived.position).toEqual(selected.position);
    expect(arrived.lastAction).toBe('Entered Main galley');

    const stale = stepOnce(cabin, {
      ...emptyCommand(),
      interact: true,
      interactionTargetId: 'door-option:atrium:stairwell-aft:0',
    }).players['crew-alpha']!;
    expect(stale.compartmentId).toBe('atrium');
    expect(stale.pendingDoor?.padId).toBe(pad.id);
  });

  it('keeps real exit pads available when already inside the aft stair tower', () => {
    const source = createCabinState();
    const stairPad = portalPadDefinitionsFor('stairwell-aft').find((pad) => pad.deck === 2);
    if (!stairPad) throw new Error('Aft stair D2 pad missing');
    const player = source.players['crew-alpha']!;
    const cabin = {
      ...source,
      players: {
        ...source.players,
        'crew-alpha': {
          ...player,
          compartmentId: 'stairwell-aft',
          waypointDeck: 2,
          position: { ...stairPad.position },
          pendingDoor: undefined,
        },
      },
    };
    const prompt = doorPromptFor(cabin.players['crew-alpha']!);
    expect(prompt?.padId).toBe(stairPad.id);
    expect(prompt?.options[0]?.target).not.toBe('stairwell-aft');
  });

  it('offers the aft-facing elevator only from its south vestibule facing the doors', () => {
    const { cabin, pad } = cabinAtPad('elevator');
    const facingDoors = cabin.players['crew-alpha']!;
    expect(nearbyPortalPad(facingDoors)?.id).toBe(pad.id);
    expect(
      nearbyPortalPad({
        ...facingDoors,
        facing: { x: 0, y: -1 },
      }),
    ).toBeUndefined();
    expect(
      nearbyPortalPad({
        ...facingDoors,
        position: { x: pad.position.x, y: pad.position.y + 0.5 },
      }),
    ).toBeUndefined();
  });

  it('teleports through a single-option door pad with host-side target validation', () => {
    const { cabin, pad } = cabinAtPad('door');
    const option = pad.options[0]!;
    const command = { ...emptyCommand(), interact: true, interactionTargetId: option.id };
    const arrived = stepOnce(cabin, command).players['crew-alpha']!;

    expect(arrived.compartmentId).toBe(option.target);
    expect(arrived.position).toEqual(option.position);
    expect(arrived.velocity).toEqual({ x: 0, y: 0 });
    expect(arrived.pendingDoor).toBeUndefined();
    expect(arrived.portalCooldown).toBeGreaterThan(0);
    expect(arrived.lastAction).toContain('Entered');
  });

  it('rejects stale or out-of-range targets', () => {
    const { cabin } = cabinAtPad('elevator');
    const player = cabin.players['crew-alpha']!;
    const invalid = {
      ...emptyCommand(),
      interact: true,
      interactionTargetId: 'elevator-option:grand-atrium:deck-99',
    };
    const rejected = stepOnce(cabin, invalid).players['crew-alpha']!;
    expect(rejected.compartmentId).toBe(player.compartmentId);
    expect(rejected.position).toEqual(player.position);
    expect(rejected.pendingDoor?.padId).toBe('elevator-pad:grand-atrium');

    const farAway = {
      ...cabin,
      players: {
        ...cabin.players,
        'crew-alpha': { ...player, position: { x: 2, y: 2 } },
      },
    };
    const outOfRange = stepOnce(farAway, {
      ...emptyCommand(),
      interact: true,
      interactionTargetId: 'elevator-option:grand-atrium:deck-4',
    }).players['crew-alpha']!;
    expect(outOfRange.compartmentId).toBe('atrium');
    expect(outOfRange.waypointDeck).toBe(2);
    expect(outOfRange.pendingDoor).toBeUndefined();
  });

  it('uses the selected elevator option atomically and preserves the deck', () => {
    const { cabin, pad } = cabinAtPad('elevator');
    const prompt = doorPromptFor(cabin.players['crew-alpha']!);
    const selected = selectedDoorOption(prompt, 'elevator-option:grand-atrium:deck-4');
    expect(prompt?.options.map((option) => option.deck)).toEqual([2, 3, 4, 5]);
    expect(selected?.deck).toBe(4);

    const arrived = stepOnce(cabin, {
      ...emptyCommand(),
      interact: true,
      interactionTargetId: selected?.id,
    }).players['crew-alpha']!;

    expect(arrived.compartmentId).toBe('atrium');
    expect(arrived.waypointDeck).toBe(4);
    expect(arrived.position).toEqual(pad.options[2]!.position);
    expect(arrived.velocity).toEqual({ x: 0, y: 0 });
    expect(arrived.lastAction).toContain('Gallery / Deck 4');
    expect(waypointDeckRenderOffset(arrived)).toBeCloseTo(6.4);
    expect(
      portalPadDefinitionsFor('atrium')
        .filter((candidate) => candidate.kind === 'door')
        .every((candidate) => candidate.deck === 2),
    ).toBe(true);
    expect(nearbyPortalPad(arrived)?.kind).toBe('elevator');
  });

  it('renders current-deck doors only and keeps the lift ring at each serviced deck', () => {
    const session = new HostSession(96);
    const presenter = new WaypointPadPresenter('crew-alpha');
    const d2 = session.snapshot();
    const d2Debug = presenter.sync(d2, 'atrium');
    expect(d2Debug.padIds).toContain('elevator-pad:grand-atrium');
    expect(d2Debug.padIds).toContain('door-pad:atrium:stairwell-aft:0');

    const d2Lift = presenter.group.getObjectByName('portal pad:elevator-pad:grand-atrium');
    if (!d2Lift) throw new Error('D2 elevator pad missing');
    const d2Y = d2Lift.position.y;
    const d2Ring = d2Lift.getObjectByName('portal pad ring');
    if (!(d2Ring instanceof THREE.Mesh)) throw new Error('D2 elevator ring missing');
    if (!(d2Ring.material instanceof THREE.MeshBasicMaterial))
      throw new Error('D2 elevator ring material missing');
    expect(d2Ring.material.depthTest).toBe(true);
    expect(d2Ring.material.depthWrite).toBe(false);
    expect(d2Ring.renderOrder).toBe(0);
    for (const deck of [3, 4, 5]) {
      const upper = structuredClone(d2);
      upper.cabin.players['crew-alpha'] = {
        ...upper.cabin.players['crew-alpha']!,
        waypointDeck: deck,
      };
      const upperDebug = presenter.sync(upper, 'atrium');
      expect(upperDebug.padIds).toContain('elevator-pad:grand-atrium');
      expect(upperDebug.padIds).not.toContain('door-pad:atrium:');
      const upperLift = presenter.group.getObjectByName('portal pad:elevator-pad:grand-atrium');
      if (!upperLift) throw new Error(`D${deck} elevator pad missing`);
      expect(upperLift.position.y - d2Y).toBeCloseTo(
        waypointDeckRenderOffset(upper.cabin.players['crew-alpha']!),
      );
    }
    presenter.dispose();
  });

  it('does not retain animated walking or route progress state', () => {
    const { cabin } = cabinAtPad('elevator');
    const player = cabin.players['crew-alpha']!;
    const next = stepOnce(cabin, emptyCommand()).players['crew-alpha']!;
    expect(waypointDeckFor(next)).toBe(2);
    expect(next.position).toEqual(player.position);
    expect(next.lastAction).toBe(player.lastAction);
  });
});

function cabinAtPad(kind: 'door' | 'elevator'): {
  cabin: CabinState;
  pad: ReturnType<typeof portalPadDefinitionsFor>[number];
} {
  const cabin = createCabinState();
  const pad = portalPadDefinitionsFor('atrium').find((candidate) => candidate.kind === kind);
  if (!pad) throw new Error(`Missing ${kind} pad`);
  const player = cabin.players['crew-alpha'];
  if (!player) throw new Error('Missing crew-alpha');
  return {
    cabin: {
      ...cabin,
      players: {
        ...cabin.players,
        'crew-alpha': {
          ...player,
          position:
            kind === 'elevator'
              ? { x: pad.position.x, y: pad.position.y - 0.5 }
              : { ...pad.position },
          facing: kind === 'elevator' ? { x: 0, y: 1 } : player.facing,
          waypointDeck: 2,
          pendingDoor: undefined,
        },
      },
    },
    pad,
  };
}

function stepOnce(cabin: CabinState, command: PlayerCommand): CabinState {
  const player = cabin.players['crew-alpha']!;
  return stepCabin(
    cabin,
    createVoyageState(),
    { 'crew-alpha': { ...command, look: { ...player.facing } }, 'crew-bravo': emptyCommand() },
    1 / 60,
  );
}
