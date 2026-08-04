import { describe, expect, it } from 'vitest';
import { activateRepair, createRepairState, stepRepair } from '../../src/sim/repair-response';
import type { CabinObject } from '../../src/sim/types';

const toolbox: CabinObject = {
  id: 'toolbox-01',
  name: 'Loose red toolbox',
  kind: 'toolbox',
  material: 'metal',
  position: { x: 5, y: 24 },
  velocity: { x: 0, y: 0 },
  radius: 0.32,
  mass: 4,
  friction: 0.4,
  impactTolerance: 2,
  secured: false,
  ownerId: 'crew-alpha',
  damage: 0,
};

describe('repair response', () => {
  it('only activates during a fire-free cruise', () => {
    expect(activateRepair(createRepairState(), 'moored', 'dormant').accepted).toBe(false);
    expect(activateRepair(createRepairState(), 'open-sea', 'active').accepted).toBe(false);

    const active = activateRepair(createRepairState(), 'open-sea', 'dormant');
    expect(active.accepted).toBe(true);
    expect(active.repair.status).toBe('active');
    expect(active.repair.pressure).toBeGreaterThan(0);
    expect(active.repair.activeCaption).toContain('DECLARED ITSELF CAPTAIN');
  });

  it('rejects the wrong tool, owner, target, and range', () => {
    const active = activateRepair(createRepairState(), 'open-sea', 'dormant').repair;
    const attempt = {
      holding: true,
      targetId: active.id,
      playerId: 'crew-alpha',
      playerPosition: active.position,
      fireStatus: 'dormant' as const,
    };

    expect(stepRepair(active, attempt, 1 / 60).accepted).toBe(false);
    expect(
      stepRepair(active, { ...attempt, heldObject: toolbox, playerId: 'crew-bravo' }, 1 / 60)
        .accepted,
    ).toBe(false);
    expect(
      stepRepair(active, { ...attempt, heldObject: toolbox, targetId: 'fire-galley' }, 1 / 60)
        .accepted,
    ).toBe(false);
    expect(
      stepRepair(
        active,
        { ...attempt, heldObject: toolbox, playerPosition: { x: 0, y: 0 } },
        1 / 60,
      ).accepted,
    ).toBe(false);
  });

  it('holds uninterrupted for three seconds, pauses pressure while repairing, and completes', () => {
    let repair = activateRepair(createRepairState(), 'open-sea', 'dormant').repair;
    const valid = {
      holding: true,
      targetId: repair.id,
      playerId: 'crew-alpha',
      playerPosition: repair.position,
      heldObject: toolbox,
      fireStatus: 'dormant' as const,
    };

    for (let tick = 0; tick < 59; tick += 1) repair = stepRepair(repair, valid, 0.05).repair;
    expect(repair.status).toBe('repairing');
    expect(repair.progress).toBeGreaterThan(0.95);
    expect(repair.pressure).toBe(0.2);

    const completed = stepRepair(repair, valid, 0.05);
    expect(completed.completed).toBe(true);
    expect(completed.repair.status).toBe('fixed');
    expect(completed.repair.pressure).toBe(0);
    expect(completed.repair.activeCaption).toContain('LOST THE ELECTION');
  });

  it('resets an interrupted repair and escalates pressure on a five-second cadence', () => {
    const active = activateRepair(createRepairState(), 'open-sea', 'dormant').repair;
    const fireInterrupt = stepRepair(
      { ...active, status: 'repairing', progress: 0.6 },
      { holding: true, fireStatus: 'active' },
      0.05,
    );
    expect(fireInterrupt.repair.status).toBe('active');
    expect(fireInterrupt.repair.progress).toBe(0);

    let repair = active;
    let pulse = false;
    for (let tick = 0; tick < 110; tick += 1) {
      const result = stepRepair(repair, { holding: false, fireStatus: 'dormant' }, 0.05);
      repair = result.repair;
      pulse ||= result.pressurePulse;
    }
    expect(pulse).toBe(true);
    expect(repair.pressure).toBeGreaterThan(active.pressure);
  });
});
