import { describe, expect, it } from 'vitest';
import { HostSession } from '../../src/sim/host-session';
import { emptyCommand } from '../../src/sim/types';

describe('host session', () => {
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
    expect(state.flight.phase).toBe('taxi');
    expect(state.flight.electrical).toBeLessThan(1);
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
});
