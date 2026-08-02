import { describe, expect, it } from 'vitest';
import { HostSession } from '../../src/sim/host-session';

describe('Phase 1 technical path', () => {
  it('runs all debug incident types, progresses flight and remains bounded', () => {
    const session = new HostSession(900);
    session.trigger('turbulence', 0.9);
    session.trigger('air-pocket');
    session.trigger('sharp-turn');
    session.trigger('collision');
    session.trigger('fire');
    session.damage('electrical');
    for (let tick = 0; tick < 360; tick += 1) session.step(1 / 60);
    for (let phase = 0; phase < 5; phase += 1) session.advancePhase();
    const state = session.snapshot();
    expect(state.flight.phase).toBe('landed');
    expect(state.cabin.lastImpulse).toBeGreaterThanOrEqual(0);
    expect(state.events.map((event) => event.type)).toContain('physics');
    expect(state.events.map((event) => event.type)).toContain('system');
    expect(state.events.map((event) => event.type)).toContain('emergency');
    expect(state.fire.status).toBe('active');
  });

  it('keeps the fire objective ahead of the coffee-machine repair', () => {
    const session = new HostSession(901);
    for (let phase = 0; phase < 3; phase += 1) session.advancePhase();
    session.trigger('fire');
    session.trigger('repair');

    const state = session.snapshot();
    expect(state.fire.status).toBe('active');
    expect(state.repair.status).toBe('dormant');
    expect(state.events[0]?.message).toContain('fire takes priority');
  });
});
