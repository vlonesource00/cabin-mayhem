import { describe, expect, it } from 'vitest';
import { HostSession } from '../../src/sim/host-session';
import { emptyCommand } from '../../src/sim/types';

describe('host session', () => {
  it('owns and advances a deterministic 78-resident cruise crowd', () => {
    const session = new HostSession(47);
    const before = session.snapshot().crowd;
    expect(Object.keys(before.residents)).toHaveLength(78);
    session.step(0.05);
    const after = session.snapshot().crowd;
    expect(after.elapsed).toBeCloseTo(0.05);
    expect(after.residents['guest-001']?.position).not.toEqual(
      before.residents['guest-001']?.position,
    );
  });

  it('only completes the breaker repair with the host-owned toolbox in range', () => {
    const session = new HostSession(48);
    session.setNetwork({ enabled: false });
    for (let phase = 0; phase < 3; phase += 1) session.advancePhase();
    session.trigger('repair');
    expect(session.snapshot().repair.status).toBe('active');

    session.teleport('crew-alpha', 'repair');
    const pickup = emptyCommand();
    pickup.interact = true;
    pickup.interactionTargetId = 'toolbox-01';
    session.submitCommand('crew-alpha', pickup);
    session.step(1 / 60);
    expect(session.snapshot().cabin.players['crew-alpha']?.heldObjectId).toBe('toolbox-01');

    for (let tick = 0; tick < 61; tick += 1) {
      const repair = emptyCommand();
      repair.repair = true;
      repair.interactionTargetId = 'repair-galley-breaker';
      session.submitCommand('crew-alpha', repair);
      session.step(0.05);
    }
    const state = session.snapshot();
    expect(state.repair.status).toBe('fixed');
    expect(state.service.score).toBeGreaterThanOrEqual(70);
  });

  it('delivers client intent through zero-latency simulated transport', () => {
    const session = new HostSession(44);
    session.setNetwork({ enabled: true, latencyMs: 0, jitterMs: 0, packetLoss: 0 });
    const start = session.snapshot().cabin.players['crew-bravo']!.position.y;
    const command = emptyCommand();
    command.move.y = -1;
    session.submitCommand('crew-bravo', command);
    session.step(1 / 30);
    const state = session.snapshot();
    expect(state.networkMetrics.received).toBe(1);
    expect(state.cabin.players['crew-bravo']!.position.y).toBeLessThan(start);
  });

  it('updates the waypoint deck when a test teleport changes compartment', () => {
    const session = new HostSession(95);
    session.teleport('crew-bravo', 'pool-deck');
    let player = session.snapshot().cabin.players['crew-bravo']!;
    expect(player.compartmentId).toBe('pool-deck');
    expect(player.waypointDeck).toBe(8);

    session.teleport('crew-bravo', 'bridge');
    player = session.snapshot().cabin.players['crew-bravo']!;
    expect(player.compartmentId).toBe('bridge');
    expect(player.waypointDeck).toBe(9);
  });

  it('stops disconnected client input and releases its held object', () => {
    const session = new HostSession(92);
    session.setNetwork({ enabled: false });
    session.teleport('crew-bravo', 'cabin');
    const look = emptyCommand();
    look.look = { x: 0, y: 1 };
    session.submitCommand('crew-bravo', look);
    session.step(1 / 60);
    const grab = emptyCommand();
    grab.look = { x: 0, y: 1 };
    grab.interact = true;
    grab.interactionTargetId = 'cart-01';
    grab.sprint = true;
    session.submitCommand('crew-bravo', grab);
    session.step(1 / 60);
    expect(session.snapshot().cabin.objects['cart-01']?.ownerId).toBe('crew-bravo');

    session.disconnectPlayer('crew-bravo');
    const state = session.snapshot();
    expect(state.cabin.players['crew-bravo']?.heldObjectId).toBeUndefined();
    expect(state.cabin.objects['cart-01']?.ownerId).toBeUndefined();
    expect(state.cabin.players['crew-bravo']?.velocity).toEqual({ x: 0, y: 0 });
  });

  it('owns phase, subsystem damage, spawn and resettable bounded state', () => {
    const session = new HostSession(45);
    session.advancePhase();
    session.damage('electrical');
    session.spawnObject();
    const state = session.snapshot();
    expect(state.voyage.phase).toBe('preparation');
    expect(state.voyage.electrical).toBeLessThan(1);
    expect(Object.keys(state.cabin.objects)).toContain('case-spawn-1');
    expect(state.events.length).toBeGreaterThanOrEqual(3);
  });

  it('moves the cart only with the host-validated Shift+E target', () => {
    const session = new HostSession(46);
    session.teleport('crew-alpha', 'cabin');

    const lookAtCart = emptyCommand();
    lookAtCart.look = { x: 0, y: 1 };
    session.submitCommand('crew-alpha', lookAtCart);
    session.step(1 / 60);

    const noTarget = emptyCommand();
    noTarget.look = { x: 0, y: 1 };
    noTarget.interact = true;
    noTarget.interactionTargetId = null;
    session.submitCommand('crew-alpha', noTarget);
    session.step(1 / 60);
    expect(session.snapshot().cabin.players['crew-alpha']!.heldObjectId).toBeUndefined();

    const grab = emptyCommand();
    grab.look = { x: 0, y: 1 };
    grab.interact = true;
    grab.interactionTargetId = 'cart-01';
    grab.sprint = true;
    session.submitCommand('crew-alpha', grab);
    session.step(1 / 60);

    const state = session.snapshot();
    expect(state.cabin.players['crew-alpha']!.heldObjectId).toBe('cart-01');
    expect(state.cabin.objects['cart-01']!.ownerId).toBe('crew-alpha');
  });

  it('rejects a forged cross-compartment pickup but accepts the authored compartment', () => {
    const session = new HostSession(49);
    session.setNetwork({ enabled: false });
    session.teleport('crew-alpha', 'bridge');
    session.teleportToObject('crew-alpha', 'toolbox-01');
    const forged = emptyCommand();
    forged.interact = true;
    forged.interactionTargetId = 'toolbox-01';
    session.submitCommand('crew-alpha', forged);
    session.step(1 / 60);
    expect(session.snapshot().cabin.players['crew-alpha']?.heldObjectId).toBeUndefined();

    session.teleport('crew-alpha', 'repair');
    session.teleportToObject('crew-alpha', 'toolbox-01');
    const legitimate = emptyCommand();
    legitimate.interact = true;
    legitimate.interactionTargetId = 'toolbox-01';
    session.submitCommand('crew-alpha', legitimate);
    session.step(1 / 60);
    const state = session.snapshot();
    expect(state.cabin.players['crew-alpha']?.heldObjectId).toBe('toolbox-01');
    expect(state.cabin.objects['toolbox-01']?.compartmentId).toBe('atrium');

    session.teleport('crew-alpha', 'navigation-repair');
    expect(session.snapshot().cabin.objects['toolbox-01']?.compartmentId).toBe('engine-room');
  });

  it('consumes a held medkit only when delivered to the matching passenger', () => {
    const session = new HostSession(47);
    session.teleport('crew-alpha', 'cabin');
    const lookAtCart = emptyCommand();
    lookAtCart.look = { x: 0, y: 1 };
    session.submitCommand('crew-alpha', lookAtCart);
    session.step(1 / 60);

    const take = emptyCommand();
    take.look = { x: 0, y: 1 };
    take.selectServiceNeed = 'medical';
    take.interact = true;
    take.interactionTargetId = 'cart-01';
    session.submitCommand('crew-alpha', take);
    session.step(1 / 60);
    const heldObjectId = session.snapshot().cabin.players['crew-alpha']!.heldObjectId;
    expect(heldObjectId).toMatch(/^cart-medical-/);
    expect(session.snapshot().service.cart.stock.medical).toBe(1);

    const deliver = emptyCommand();
    deliver.interact = true;
    deliver.interactionTargetId = 'passenger-sofia';
    session.submitCommand('crew-alpha', deliver);
    session.step(1 / 60);
    const state = session.snapshot();
    expect(state.cabin.players['crew-alpha']!.heldObjectId).toBeUndefined();
    expect(state.cabin.objects[heldObjectId!]).toBeUndefined();
    expect(state.service.passengers['passenger-sofia']!.requestStatus).toBe('served');
    expect(state.service.score).toBeGreaterThan(100);
  });

  it('keeps fire authority on the host and suppresses it only with a nearby held extinguisher', () => {
    const session = new HostSession(48);
    session.trigger('fire', 0.82);
    expect(session.snapshot().fire.status).toBe('active');
    expect(session.snapshot().service.score).toBe(-35);

    session.teleport('crew-alpha', 'cabin');
    const grab = emptyCommand();
    grab.interact = true;
    grab.interactionTargetId = 'extinguisher-01';
    session.submitCommand('crew-alpha', grab);
    session.step(1 / 60);
    expect(session.snapshot().cabin.players['crew-alpha']!.heldObjectId).toBe('extinguisher-01');

    session.teleport('crew-alpha', 'galley');
    const spray = emptyCommand();
    spray.interact = true;
    spray.interactionTargetId = 'fire-galley';
    session.submitCommand('crew-alpha', spray);
    session.step(1 / 60);
    expect(session.snapshot().fire.status).toBe('suppressed');
    expect(session.snapshot().cabin.players['crew-alpha']!.heldObjectId).toBe('extinguisher-01');
  });

  it('keeps boarding phase, compartment, range, damage, and resolution host-authoritative', () => {
    const session = new HostSession(93);
    session.setNetwork({ enabled: false });
    session.trigger('boarding-invasion-debug');
    for (let tick = 0; tick < 4; tick += 1) session.step(0.05);
    expect(session.snapshot().invasion.phase).toBe('boarders-aboard');

    const forged = emptyCommand();
    forged.boardingAction = {
      kind: 'detach-boarding-board',
      targetId: 'port-boarding-board',
    };
    session.submitCommand('crew-alpha', forged);
    session.step(0.05);
    expect(session.snapshot().invasion.links['port-boarding-board']?.status).toBe('attached');
    expect(session.snapshot().cabin.players['crew-alpha']?.lastAction).toContain(
      'outside promenade',
    );

    session.teleport('crew-alpha', 'boarding-port');
    session.submitCommand('crew-alpha', forged);
    session.step(0.05);
    expect(session.snapshot().invasion.links['port-boarding-board']?.status).toBe('detached');

    const finish = emptyCommand();
    finish.boardingAction = { kind: 'release-gangway', targetId: 'starboard-gangway' };
    session.teleport('crew-alpha', 'boarding-starboard');
    session.submitCommand('crew-alpha', finish);
    session.step(0.05);
    const state = session.snapshot();
    expect(state.invasion.phase).toBe('repelled');
    expect(state.invasion.hostileCount).toBe(0);
    expect(state.service.score).toBe(170);
    expect(JSON.parse(JSON.stringify(state.invasion))).toEqual(state.invasion);
  });
});
