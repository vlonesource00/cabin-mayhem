import { describe, expect, it } from 'vitest';
import { boardingEventCatalog, boardingInvasionDefinition } from '../../src/data/invasions';
import { createCabinState } from '../../src/sim/cabin-simulation';
import {
  activateBoardingInvasion,
  createBoardingInvasionState,
  resolveBoardingDefenseAction,
  stepBoardingInvasion,
  triggerBoardingEvent,
} from '../../src/sim/boarding-invasion';

function advanceToBoarders() {
  let invasion = activateBoardingInvasion(createBoardingInvasionState(), {
    warningSeconds: 0.1,
    approachSeconds: 0.1,
  }).invasion;
  invasion = stepBoardingInvasion(invasion, 0.1).invasion;
  invasion = stepBoardingInvasion(invasion, 0.1).invasion;
  return invasion;
}

describe('boarding invasion', () => {
  it('publishes deterministic pirate and saboteur schedules with safe trigger gates', () => {
    expect(boardingEventCatalog).toMatchObject([
      {
        id: 'pirate-boarding-alpha',
        enemyKind: 'pirate',
        schedule: {
          voyagePhase: 'open-sea',
          triggerAfterCruiseSeconds: boardingInvasionDefinition.triggerAfterCruiseSeconds,
          requiresActiveService: true,
          requiresClearNavigation: true,
        },
      },
      {
        id: 'saboteur-boarding-alpha',
        enemyKind: 'bomber',
        schedule: { voyagePhase: 'open-sea', triggerAfterCruiseSeconds: 110 },
      },
    ]);

    const initial = createBoardingInvasionState();
    const freshStart = triggerBoardingEvent(
      initial,
      { mode: 'scheduled' },
      {
        voyagePhase: 'moored',
        cruiseSeconds: 0,
        serviceActive: false,
        navigationClear: true,
        explicit: false,
      },
    );
    expect(freshStart.accepted).toBe(false);
    expect(freshStart.message).toContain('outside open-sea');

    const implicitDebug = triggerBoardingEvent(
      initial,
      { mode: 'debug', warningSeconds: 0.1, approachSeconds: 0.1 },
      {
        voyagePhase: 'moored',
        cruiseSeconds: 0,
        serviceActive: false,
        navigationClear: true,
        explicit: false,
      },
    );
    expect(implicitDebug.accepted).toBe(false);
    expect(implicitDebug.message).toContain('non-explicit');

    const pirate = triggerBoardingEvent(
      initial,
      { mode: 'scheduled' },
      {
        voyagePhase: 'open-sea',
        cruiseSeconds: boardingInvasionDefinition.triggerAfterCruiseSeconds,
        serviceActive: true,
        navigationClear: true,
        explicit: false,
      },
    );
    expect(pirate).toMatchObject({
      accepted: true,
      eventId: 'pirate-boarding-alpha',
      mode: 'scheduled',
      invasion: { phase: 'warning', enemyKind: 'pirate' },
    });

    const saboteur = triggerBoardingEvent(
      initial,
      {
        eventId: 'saboteur-boarding-alpha',
        mode: 'debug',
        warningSeconds: 0.1,
        approachSeconds: 0.1,
      },
      {
        voyagePhase: 'moored',
        cruiseSeconds: 0,
        serviceActive: false,
        navigationClear: true,
        explicit: true,
      },
    );
    expect(saboteur).toMatchObject({
      accepted: true,
      eventId: 'saboteur-boarding-alpha',
      mode: 'debug',
      invasion: {
        name: 'Blackwake saboteur boarding',
        enemyKind: 'bomber',
        phase: 'warning',
      },
    });
  });

  it('advances through authored warning, approach, and aboard phases', () => {
    const initial = createBoardingInvasionState();
    expect(JSON.parse(JSON.stringify(initial))).toEqual(initial);
    const warning = activateBoardingInvasion(initial, {
      warningSeconds: 0.1,
      approachSeconds: 0.1,
    });
    expect(warning.accepted).toBe(true);
    expect(warning.invasion.phase).toBe('warning');

    const approach = stepBoardingInvasion(warning.invasion, 0.1);
    expect(approach.invasion.phase).toBe('approach');
    const aboard = stepBoardingInvasion(approach.invasion, 0.1);
    expect(aboard.invasion.phase).toBe('boarders-aboard');
    expect(aboard.invasion.hostileCount).toBe(boardingInvasionDefinition.initialHostileCount);
    expect(aboard.invasion.links['port-boarding-board']?.status).toBe('attached');
    expect(boardingInvasionDefinition.assets.map((asset) => asset.id)).toHaveLength(8);
    expect(
      boardingInvasionDefinition.assets.find((asset) => asset.id === 'pirate-boarder-character'),
    ).toMatchObject({
      path: '/assets/invasions/characters/pirate-boarder.glb',
      requiredActions: expect.arrayContaining(['Board', 'Aim', 'Fire', 'Retreat']),
    });
    expect(
      boardingInvasionDefinition.assets.find((asset) => asset.id === 'saboteur-boarder-character'),
    ).toMatchObject({
      path: '/assets/invasions/characters/saboteur-boarder.glb',
      requiredActions: expect.arrayContaining(['PlantExplosive', 'ArmExplosive']),
    });
  });

  it('rejects forged phase, action, compartment, and range inputs', () => {
    const player = createCabinState().players['crew-alpha']!;
    const tooEarly = resolveBoardingDefenseAction(
      createBoardingInvasionState(),
      { kind: 'detach-boarding-board', targetId: 'port-boarding-board' },
      player,
    );
    expect(tooEarly.accepted).toBe(false);
    expect(tooEarly.message).toContain('during idle');

    const aboard = advanceToBoarders();
    const forged = resolveBoardingDefenseAction(
      aboard,
      { kind: 'teleport-boarders', targetId: 'port-boarding-board' },
      player,
    );
    expect(forged.accepted).toBe(false);
    expect(forged.message).toContain('invalid boarding action');

    const wrongCompartment = resolveBoardingDefenseAction(
      aboard,
      { kind: 'detach-boarding-board', targetId: 'port-boarding-board' },
      player,
    );
    expect(wrongCompartment.message).toContain('outside promenade');

    player.compartmentId = 'promenade';
    player.position = { x: 0, y: 0 };
    const outOfRange = resolveBoardingDefenseAction(
      aboard,
      { kind: 'detach-boarding-board', targetId: 'port-boarding-board' },
      player,
    );
    expect(outOfRange.message).toContain('out-of-range');

    player.position = { ...boardingInvasionDefinition.links[0]!.position };
    const wrongAction = resolveBoardingDefenseAction(
      aboard,
      { kind: 'release-gangway', targetId: 'port-boarding-board' },
      player,
    );
    expect(wrongAction.message).toContain('wrong action');
  });

  it('resolves only after both authored boarding links are detached', () => {
    const player = createCabinState().players['crew-alpha']!;
    player.compartmentId = 'promenade';
    player.position = { ...boardingInvasionDefinition.links[0]!.position };
    const port = resolveBoardingDefenseAction(
      advanceToBoarders(),
      { kind: 'detach-boarding-board', targetId: 'port-boarding-board' },
      player,
    );
    expect(port.accepted).toBe(true);
    expect(port.resolved).toBe(false);
    expect(port.invasion.phase).toBe('boarders-aboard');

    player.position = { ...boardingInvasionDefinition.links[1]!.position };
    const starboard = resolveBoardingDefenseAction(
      port.invasion,
      { kind: 'release-gangway', targetId: 'starboard-gangway' },
      player,
    );
    expect(starboard.accepted).toBe(true);
    expect(starboard.resolved).toBe(true);
    expect(starboard.invasion.phase).toBe('repelled');
    expect(starboard.invasion.hostileCount).toBe(0);
    expect(starboard.scoreDelta).toBe(
      boardingInvasionDefinition.detachScore + boardingInvasionDefinition.resolutionScore,
    );

    const stale = resolveBoardingDefenseAction(
      starboard.invasion,
      { kind: 'detach-boarding-board', targetId: 'port-boarding-board' },
      player,
    );
    expect(stale.accepted).toBe(false);
    expect(stale.message).toContain('during repelled');
  });

  it('runs saboteur variant through warning, approach, aboard, and failure phases', () => {
    let invasion = triggerBoardingEvent(
      createBoardingInvasionState(),
      {
        eventId: 'saboteur-boarding-alpha',
        mode: 'debug',
        warningSeconds: 0.1,
        approachSeconds: 0.1,
        maxRaidSeconds: 0.2,
      },
      {
        voyagePhase: 'moored',
        cruiseSeconds: 0,
        serviceActive: false,
        navigationClear: true,
        explicit: true,
      },
    ).invasion;
    expect(invasion.phase).toBe('warning');
    invasion = stepBoardingInvasion(invasion, 0.1).invasion;
    expect(invasion.phase).toBe('approach');
    invasion = stepBoardingInvasion(invasion, 0.1).invasion;
    expect(invasion).toMatchObject({
      phase: 'boarders-aboard',
      enemyKind: 'bomber',
      hostileCount: 6,
    });
    const failed = stepBoardingInvasion(invasion, 0.2);
    expect(failed.invasion.phase).toBe('failed');
    expect(failed.message).toContain('SABOTEURS');
  });

  it('applies bounded deterministic protection and infrastructure pressure', () => {
    let invasion = advanceToBoarders();
    let pulse = stepBoardingInvasion(invasion, 1);
    pulse = stepBoardingInvasion(pulse.invasion, 1);
    pulse = stepBoardingInvasion(pulse.invasion, 1);
    invasion = pulse.invasion;

    expect(invasion.infrastructure.damageEvents).toBe(1);
    expect(invasion.infrastructure.integrity).toBe(88);
    expect(invasion.passengerProtection.protected).toBe(7);
    expect(pulse.structureDamage).toBe(0.12);
    expect(pulse.scoreDelta).toBe(-15);

    const failedStart = activateBoardingInvasion(createBoardingInvasionState(), {
      warningSeconds: 0.05,
      approachSeconds: 0.05,
      maxRaidSeconds: 0.1,
    }).invasion;
    const approach = stepBoardingInvasion(failedStart, 0.05).invasion;
    const aboard = stepBoardingInvasion(approach, 0.05).invasion;
    const failed = stepBoardingInvasion(aboard, 0.1);
    expect(failed.invasion.phase).toBe('failed');
    expect(failed.scoreDelta).toBe(boardingInvasionDefinition.failureScore);
  });
});
