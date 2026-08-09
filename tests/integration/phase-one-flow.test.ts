import { describe, expect, it } from 'vitest';
import { HostSession } from '../../src/sim/host-session';
import { emptyCommand } from '../../src/sim/types';
import { createCabinState } from '../../src/sim/cabin-simulation';
import { feedbackForObjectKind } from '../../src/three/interactable-feedback';

describe('Phase 1 technical path', () => {
  it('keeps every current authored object interaction visibly covered by a feedback contract', () => {
    const cabin = createCabinState();
    for (const object of Object.values(cabin.objects))
      expect(feedbackForObjectKind(object.kind)).toMatch(/\S/);
    expect(feedbackForObjectKind('toolbox')).toContain('toolbox');
    expect(feedbackForObjectKind('extinguisher')).toContain('extinguisher');
  });

  it('runs all debug incident types, progresses voyage and remains bounded', () => {
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
    expect(state.voyage.phase).toBe('docked');
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

  it('runs warning, bridge helm input, and avoidance through the host snapshot', () => {
    const session = new HostSession(902);
    session.setNetwork({ enabled: false });
    session.trigger('collision-course-debug');
    expect(session.snapshot().navigation.phase).toBe('warning');
    expect(session.snapshot().navigation.countdown).toBeGreaterThan(0);

    session.teleport('crew-alpha', 'bridge');
    const helm = emptyCommand();
    helm.helm.rudder = -1;
    session.submitCommand('crew-alpha', helm);
    for (let tick = 0; tick < 30 && session.snapshot().navigation.phase === 'warning'; tick += 1)
      session.step(0.05);

    expect(session.snapshot().navigation.phase).toBe('avoided');
    expect(session.snapshot().events[0]?.message).toContain('Avoided');
  });

  it('runs warning, impact, authored engine-room repair, and resolution through the host snapshot', () => {
    const session = new HostSession(903);
    session.setNetwork({ enabled: false });
    session.trigger('collision-course-debug');
    for (let tick = 0; tick < 70 && session.snapshot().navigation.phase === 'warning'; tick += 1)
      session.step(0.05);
    expect(session.snapshot().navigation.phase).toBe('impact');
    expect(session.snapshot().navigation.repair.compartmentId).toBe('engine-room');

    session.teleport('crew-alpha', 'repair');
    const pickup = emptyCommand();
    pickup.interact = true;
    pickup.interactionTargetId = 'toolbox-01';
    session.submitCommand('crew-alpha', pickup);
    session.step(0.05);
    session.teleport('crew-alpha', 'navigation-repair');
    for (let tick = 0; tick < 70; tick += 1) {
      const repair = emptyCommand();
      repair.repair = true;
      repair.interactionTargetId = 'repair-steering-relay';
      session.submitCommand('crew-alpha', repair);
      session.step(0.05);
    }

    const state = session.snapshot();
    expect(state.navigation.phase).toBe('repaired');
    expect(state.navigation.repair.status).toBe('fixed');
    expect(state.voyage.warning).toContain('RESTORED');
  });
});
