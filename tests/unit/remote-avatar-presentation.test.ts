import { describe, expect, it } from 'vitest';
import { stepRemoteAvatarPresentation, type RemoteAvatarTarget } from '../../src/three/cabin-world';

describe('remote avatar presentation', () => {
  it('smooths same-compartment motion and snaps compartment or deck jumps', () => {
    const target: RemoteAvatarTarget = {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      compartmentId: 'atrium',
      deck: 1,
    };
    const first = stepRemoteAvatarPresentation(undefined, target, 1 / 60);
    const moving = stepRemoteAvatarPresentation(first, { ...target, x: 10, yaw: Math.PI }, 1 / 60);
    expect(moving.x).toBeGreaterThan(0);
    expect(moving.x).toBeLessThan(10);
    expect(moving.yaw).toBeGreaterThan(0);
    expect(moving.yaw).toBeLessThan(Math.PI);

    const jumped = stepRemoteAvatarPresentation(
      moving,
      { ...target, x: 100, compartmentId: 'engine-room', deck: 2 },
      1 / 60,
    );
    expect(jumped).toMatchObject({ x: 100, compartmentId: 'engine-room', deck: 2 });
  });
});
