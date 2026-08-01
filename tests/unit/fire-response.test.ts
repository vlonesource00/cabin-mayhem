import { describe, expect, it } from 'vitest';
import { activateFire, createFireState, suppressFire } from '../../src/sim/fire-response';
import type { CabinObject } from '../../src/sim/types';

const extinguisher: CabinObject = {
  id: 'extinguisher-01',
  name: 'Fire extinguisher',
  kind: 'extinguisher',
  material: 'metal',
  position: { x: 10.8, y: 23.6 },
  velocity: { x: 0, y: 0 },
  radius: 0.25,
  mass: 4,
  friction: 0.3,
  impactTolerance: 2,
  secured: false,
  damage: 0,
};

describe('fire response', () => {
  it('requires an active nearby extinguisher spray and suppresses the galley fire', () => {
    const active = activateFire(createFireState());
    expect(active.accepted).toBe(true);
    expect(active.fire.status).toBe('active');

    const noTool = suppressFire(active.fire, undefined, active.fire.position);
    expect(noTool.accepted).toBe(false);

    const distant = suppressFire(active.fire, extinguisher, { x: 1, y: 1 });
    expect(distant.accepted).toBe(false);

    const suppressed = suppressFire(active.fire, extinguisher, active.fire.position);
    expect(suppressed.accepted).toBe(true);
    expect(suppressed.fire.status).toBe('suppressed');
    expect(suppressed.fire.intensity).toBeLessThanOrEqual(0.12);
  });
});
