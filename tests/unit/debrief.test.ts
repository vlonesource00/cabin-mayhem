import { describe, expect, it } from 'vitest';
import { buildDebrief } from '../../src/app/debrief';
import { HostSession } from '../../src/sim/host-session';

describe('landing debrief', () => {
  it('stays hidden while the shift is active', () => {
    expect(buildDebrief(new HostSession().snapshot())).toBeUndefined();
  });

  it('summarizes a failed landing from authoritative state', () => {
    const session = new HostSession();
    for (let phase = 0; phase < 5; phase += 1) session.advancePhase();
    session.step(1 / 60);

    const debrief = buildDebrief(session.snapshot());
    expect(debrief).toMatchObject({
      outcome: 'failed',
      outcomeLabel: 'SHIFT LOST',
      served: 0,
      missed: 0,
    });
    expect(debrief?.reviews).toHaveLength(4);
    expect(debrief?.fire.result).toBe('NO INCIDENT');
    expect(debrief?.repair.result).toBe('NO INCIDENT');
  });

  it('reports resolved emergencies without mutating mission state', () => {
    const state = new HostSession().snapshot();
    state.service.outcome = 'success';
    state.service.score = 640;
    state.service.served = 5;
    state.service.missed = 1;
    state.fire.status = 'suppressed';
    state.repair.status = 'fixed';
    const before = structuredClone(state);

    const debrief = buildDebrief(state);
    expect(debrief).toMatchObject({
      outcome: 'success',
      score: 640,
      served: 5,
      missed: 1,
      fire: { result: 'SUPPRESSED' },
      repair: { result: 'DEFEATED' },
    });
    expect(state).toEqual(before);
  });
});
