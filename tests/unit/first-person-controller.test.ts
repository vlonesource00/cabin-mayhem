import { describe, expect, it } from 'vitest';
import { cameraRelativeMovement } from '../../src/three/first-person-controller';

describe('first-person camera-relative movement', () => {
  it('moves W in the exact direction the Three.js camera faces', () => {
    const forwardInput = { x: 0, y: -1 };

    expect(cameraRelativeMovement(forwardInput, 0).move).toEqual({ x: 0, y: -1 });
    expect(cameraRelativeMovement(forwardInput, Math.PI).move.x).toBeCloseTo(0);
    expect(cameraRelativeMovement(forwardInput, Math.PI).move.y).toBeCloseTo(1);
    expect(cameraRelativeMovement(forwardInput, Math.PI / 2).move.x).toBeCloseTo(-1);
    expect(cameraRelativeMovement(forwardInput, Math.PI / 2).move.y).toBeCloseTo(0);
    expect(cameraRelativeMovement(forwardInput, -Math.PI / 2).move.x).toBeCloseTo(1);
    expect(cameraRelativeMovement(forwardInput, -Math.PI / 2).move.y).toBeCloseTo(0);
  });

  it('keeps strafing perpendicular to camera forward', () => {
    const yaw = Math.PI / 3;
    const forward = cameraRelativeMovement({ x: 0, y: -1 }, yaw).move;
    const right = cameraRelativeMovement({ x: 1, y: 0 }, yaw).move;

    expect(forward.x * right.x + forward.y * right.y).toBeCloseTo(0);
  });

  it('moves S directly opposite the camera forward vector', () => {
    const yaw = 0.73;
    const forward = cameraRelativeMovement({ x: 0, y: -1 }, yaw).move;
    const backward = cameraRelativeMovement({ x: 0, y: 1 }, yaw).move;

    expect(backward.x).toBeCloseTo(-forward.x);
    expect(backward.y).toBeCloseTo(-forward.y);
  });
});
