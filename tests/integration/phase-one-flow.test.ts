import { describe, expect, it } from 'vitest';
import { HostSession } from '../../src/sim/host-session';

describe('Phase 1 technical path', () => {
  it('runs all debug incident types, progresses flight and remains bounded', () => {
    const session = new HostSession(900);
    session.trigger('turbulence', 0.9);
    session.trigger('air-pocket');
    session.trigger('sharp-turn');
    session.trigger('collision');
    session.damage('electrical');
    for (let tick = 0; tick < 360; tick += 1) session.step(1 / 60);
    for (let phase = 0; phase < 5; phase += 1) session.advancePhase();
    const state = session.snapshot();
    expect(state.flight.phase).toBe('landed');
    expect(state.cabin.lastImpulse).toBeGreaterThanOrEqual(0);
    expect(state.events.map((event) => event.type)).toContain('physics');
    expect(state.events.map((event) => event.type)).toContain('system');
  });
});
