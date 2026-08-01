import { describe, expect, it } from 'vitest';
import { HostSession } from '../../src/sim/host-session';
import { emptyCommand } from '../../src/sim/types';

describe('host session', () => {
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

  it('grabs only the host-validated crosshair target and owns it', () => {
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
    session.submitCommand('crew-alpha', grab);
    session.step(1 / 60);

    const state = session.snapshot();
    expect(state.cabin.players['crew-alpha']!.heldObjectId).toBe('cart-01');
    expect(state.cabin.objects['cart-01']!.ownerId).toBe('crew-alpha');
  });
});
