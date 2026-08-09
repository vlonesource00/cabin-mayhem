import { describe, expect, it } from 'vitest';
import { HostSession } from '../../src/sim/host-session';
import { navigationIncidentDefinition } from '../../src/data/emergencies';
import { emptyCommand } from '../../src/sim/types';
import { createNavigationIncidentState, stepNavigation } from '../../src/sim/navigation-incident';

function advanceUntil(
  session: HostSession,
  predicate: (session: HostSession) => boolean,
  limit = 120,
): void {
  for (let tick = 0; tick < limit && !predicate(session); tick += 1) session.step(0.05);
}

describe('navigation collision-course incident', () => {
  it('keeps production warning timing travel-capable while debug timing stays accelerated', () => {
    const session = new HostSession(1199);
    session.trigger('collision-course');
    const state = session.snapshot();
    expect(state.navigation.warningSeconds).toBeGreaterThanOrEqual(30);
    expect(state.navigation.warningSeconds).toBeLessThanOrEqual(45);
    expect(state.navigation.phase).toBe('warning');
    session.step(0.05);
    expect(session.snapshot().navigation.phase).toBe('warning');
    expect(session.snapshot().navigation.countdown).toBeLessThan(state.navigation.countdown);
  });

  it('starts with a deterministic warning/countdown and bounded moving contact', () => {
    const first = new HostSession(1200);
    const second = new HostSession(1200);
    first.setNetwork({ enabled: false });
    second.setNetwork({ enabled: false });
    first.trigger('collision-course-debug');
    second.trigger('collision-course-debug');

    expect(first.snapshot().navigation.phase).toBe('warning');
    expect(first.snapshot().navigation.countdown).toBe(3);
    first.step(0.05);
    second.step(0.05);
    expect(first.snapshot().navigation).toEqual(second.snapshot().navigation);
    expect(first.snapshot().navigation.obstacle.relativePosition.y).toBeLessThan(58);

    advanceUntil(first, (session) => session.snapshot().navigation.phase === 'impact');
    const state = first.snapshot();
    expect(state.navigation.phase).toBe('impact');
    expect(state.navigation.elapsed).toBeLessThanOrEqual(3);
    expect(state.navigation.countdown).toBe(0);
    expect(state.navigation.obstacle.relativePosition.y).toBeGreaterThanOrEqual(-8);
    expect(state.navigation.repair.pressure).toBeLessThanOrEqual(1);
  });

  it('requires bridge presence and accepts a deterministic helm avoidance', () => {
    const session = new HostSession(1201);
    session.setNetwork({ enabled: false });
    session.trigger('collision-course-debug');
    session.teleport('crew-alpha', 'bridge');
    const helm = emptyCommand();
    helm.helm.rudder = 1;
    session.submitCommand('crew-alpha', helm);
    advanceUntil(session, (current) => current.snapshot().navigation.phase !== 'warning');

    const state = session.snapshot();
    expect(state.navigation.phase).toBe('avoided');
    expect(state.navigation.lastOutcome).toContain('Avoided');
    expect(state.service.score).toBe(navigationIncidentDefinition.avoidScore);
    expect(state.voyage.hydraulics).toBe(1);
  });

  it('rejects remote helm input from outside the authored bridge station', () => {
    const session = new HostSession(1202);
    session.setNetwork({ enabled: true, latencyMs: 0, jitterMs: 0, packetLoss: 0 });
    session.trigger('collision-course-debug');
    session.teleport('crew-bravo', 'cabin');
    const remoteHelm = emptyCommand();
    remoteHelm.helm.rudder = 1;
    session.submitCommand('crew-bravo', remoteHelm);
    session.step(0.05);

    const state = session.snapshot();
    expect(state.navigation.phase).toBe('warning');
    expect(state.navigation.obstacle.relativePosition.x).toBe(0);
    expect(state.navigation.helmProgress).toBe(0);
  });

  it('rejects host helm input outside the bridge and accepts guest helm input at the bridge', () => {
    const session = new HostSession(1205);
    session.setNetwork({ enabled: false });
    session.trigger('collision-course-debug');
    const hostHelm = emptyCommand();
    hostHelm.helm.rudder = 1;
    session.submitCommand('crew-alpha', hostHelm);
    session.step(0.05);
    expect(session.snapshot().navigation.obstacle.relativePosition.x).toBe(0);

    session.teleport('crew-bravo', 'bridge');
    const guestHelm = emptyCommand();
    guestHelm.helm.telegraph = 0.5;
    guestHelm.helm.rudder = 1;
    session.submitCommand('crew-bravo', guestHelm);
    advanceUntil(session, (current) => current.snapshot().navigation.phase !== 'warning');
    expect(session.snapshot().navigation.phase).toBe('avoided');
  });

  it('does not let a queued disconnected client command take the helm', () => {
    const session = new HostSession(1204);
    session.setNetwork({ enabled: true, latencyMs: 100, jitterMs: 0, packetLoss: 0 });
    session.trigger('collision-course-debug');
    session.teleport('crew-bravo', 'bridge');
    const remoteHelm = emptyCommand();
    remoteHelm.helm.rudder = 1;
    session.submitCommand('crew-bravo', remoteHelm);
    session.disconnectPlayer('crew-bravo');
    advanceUntil(session, (current) => current.snapshot().navigation.phase !== 'warning');

    expect(session.snapshot().navigation.phase).toBe('impact');
  });

  it('reconnects a guest with fresh command state and invalidates queued pre-disconnect input', () => {
    const session = new HostSession(1206);
    session.setNetwork({ enabled: true, latencyMs: 100, jitterMs: 0, packetLoss: 0 });
    session.trigger('collision-course-debug');
    session.teleport('crew-bravo', 'bridge');
    const queuedBeforeDisconnect = emptyCommand();
    queuedBeforeDisconnect.helm.rudder = 1;
    session.submitCommand('crew-bravo', queuedBeforeDisconnect);
    session.disconnectPlayer('crew-bravo');
    session.reconnectPlayer('crew-bravo');
    expect(session.snapshot().cabin.players['crew-bravo']?.lastAction).toBe('Reconnected');
    const fresh = emptyCommand();
    fresh.helm.rudder = 1;
    session.submitCommand('crew-bravo', fresh);
    advanceUntil(session, (current) => current.snapshot().navigation.phase !== 'warning');
    expect(session.snapshot().navigation.phase).toBe('avoided');
  });

  it('creates damage, rejects the wrong repair compartment, then resolves at the engine room relay', () => {
    const session = new HostSession(1203);
    session.setNetwork({ enabled: false });
    session.trigger('collision-course-debug');
    advanceUntil(session, (current) => current.snapshot().navigation.phase === 'impact');
    const impacted = session.snapshot();
    expect(impacted.service.score).toBe(navigationIncidentDefinition.impactScore);
    expect(impacted.voyage.hydraulics).toBeLessThan(1);
    expect(impacted.navigation.repair.status).toBe('active');
    expect(impacted.navigation.repair.compartmentId).toBe('engine-room');

    session.teleport('crew-alpha', 'repair');
    const pickup = emptyCommand();
    pickup.interact = true;
    pickup.interactionTargetId = 'toolbox-01';
    session.submitCommand('crew-alpha', pickup);
    session.step(0.05);
    const wrongLocationRepair = emptyCommand();
    wrongLocationRepair.repair = true;
    wrongLocationRepair.interactionTargetId = 'repair-steering-relay';
    session.submitCommand('crew-alpha', wrongLocationRepair);
    session.step(0.05);
    expect(session.snapshot().navigation.repair.progress).toBe(0);
    expect(session.snapshot().navigation.phase).toBe('impact');

    session.teleport('crew-alpha', 'navigation-repair');
    for (let tick = 0; tick < 70; tick += 1) {
      const repair = emptyCommand();
      repair.repair = true;
      repair.interactionTargetId = 'repair-steering-relay';
      session.submitCommand('crew-alpha', repair);
      session.step(0.05);
    }
    const repaired = session.snapshot();
    expect(repaired.navigation.phase).toBe('repaired');
    expect(repaired.navigation.repair.status).toBe('fixed');
    expect(repaired.voyage.hydraulics).toBe(1);
    expect(repaired.service.score).toBe(
      navigationIncidentDefinition.impactScore + navigationIncidentDefinition.repairScore,
    );
  });

  it('accepts guest-owned toolbox pickup and guest steering-relay repair at the authored compartment', () => {
    const session = new HostSession(1207);
    session.setNetwork({ enabled: false });
    session.trigger('collision-course-debug');
    advanceUntil(session, (current) => current.snapshot().navigation.phase === 'impact');

    session.teleport('crew-bravo', 'repair');
    const aim = emptyCommand();
    aim.look = { x: -0.32, y: -0.95 };
    session.submitCommand('crew-bravo', aim);
    session.step(0.05);
    const pickup = emptyCommand();
    pickup.look = { x: -0.32, y: -0.95 };
    pickup.interact = true;
    pickup.interactionTargetId = 'toolbox-01';
    session.submitCommand('crew-bravo', pickup);
    session.step(0.05);
    expect(session.snapshot().cabin.players['crew-bravo']?.heldObjectId).toBe('toolbox-01');

    session.teleport('crew-bravo', 'navigation-repair');
    for (let tick = 0; tick < 70; tick += 1) {
      const repair = emptyCommand();
      repair.repair = true;
      repair.interactionTargetId = 'repair-steering-relay';
      session.submitCommand('crew-bravo', repair);
      session.step(0.05);
    }
    expect(session.snapshot().navigation.phase).toBe('repaired');
  });

  it('clamps a large simulation step and never escapes bounded contact state', () => {
    const navigation = createNavigationIncidentState();
    navigation.warningSeconds = 3;
    navigation.phase = 'warning';
    const result = stepNavigation(navigation, {}, {}, 60);
    expect(result.navigation.elapsed).toBe(0.05);
    expect(result.navigation.countdown).toBe(2.95);
    expect(result.navigation.obstacle.relativePosition.y).toBe(57.1);
    expect(result.navigation.obstacle.relativePosition.y).toBeGreaterThanOrEqual(-8);
    expect(result.navigation.obstacle.relativePosition.y).toBeLessThanOrEqual(58);
  });
});
