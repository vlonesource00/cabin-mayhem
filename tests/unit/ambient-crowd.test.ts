import { describe, expect, it } from 'vitest';
import { ambientResidentCount } from '../../src/data/ambient-crowd';
import { createAmbientCrowdState, stepAmbientCrowd } from '../../src/sim/ambient-crowd';

describe('ambient cruise crowd', () => {
  it('creates the full deterministic resident manifest across the ship', () => {
    const first = createAmbientCrowdState(101);
    const second = createAmbientCrowdState(101);
    expect(first).toEqual(second);
    expect(Object.keys(first.residents)).toHaveLength(ambientResidentCount);
    expect(ambientResidentCount).toBe(78);
    expect(new Set(Object.values(first.residents).map((guest) => guest.compartmentId))).toEqual(
      new Set([
        'atrium',
        'main-galley',
        'dining-room',
        'cabin-deck-four',
        'promenade',
        'cabin-deck-seven',
        'pool-deck',
        'sun-deck',
      ]),
    );
  });

  it('moves active guests deterministically and keeps every route bounded', () => {
    const initial = createAmbientCrowdState(202);
    let state = initial;
    for (let tick = 0; tick < 120; tick += 1) state = stepAmbientCrowd(state, 'idle', 0.05);
    const moved = Object.values(state.residents).filter((guest) => {
      const start = initial.residents[guest.id]!.position;
      return Math.hypot(guest.position.x - start.x, guest.position.y - start.y) > 0.1;
    });
    expect(moved.length).toBeGreaterThan(30);
    for (const guest of Object.values(state.residents)) {
      expect(Number.isFinite(guest.position.x)).toBe(true);
      expect(Number.isFinite(guest.position.y)).toBe(true);
      expect(guest.routeIndex === 0 || guest.routeIndex === 1).toBe(true);
    }
  });

  it('switches everyone to evacuation during a boarding threat and restores leisure', () => {
    const initial = createAmbientCrowdState(303);
    const threat = stepAmbientCrowd(initial, 'boarders-aboard', 0.05);
    expect(threat.evacuating).toBe(true);
    expect(Object.values(threat.residents).every((guest) => guest.activity === 'evacuating')).toBe(
      true,
    );
    const clear = stepAmbientCrowd(threat, 'repelled', 0.05);
    expect(clear.evacuating).toBe(false);
    expect(
      Object.values(clear.residents).every((guest) => guest.activity === guest.homeActivity),
    ).toBe(true);
  });
});
