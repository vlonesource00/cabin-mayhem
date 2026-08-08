import * as THREE from 'three';
import { renderToShip, shipToRender } from './coordinates';
import type { Vec2 } from '../sim/types';

/**
 * A free camera that ignores the ship.
 *
 * The crew are clamped inside a compartment's walls, which is the right rule for
 * playing and the wrong one for looking at the thing you just built. This camera
 * has no collision, no gravity and no compartment: it holds a position in ship
 * space and flies wherever it is pointed, so the hull can be inspected from the
 * sea, from the funnel, and from inside a bulkhead.
 *
 * Ship space rather than render space is the important choice. The render origin
 * moves whenever the crew below walks into another compartment, and a camera
 * parked in render space would be dragged along with it. Stated against the ship
 * the free camera stays exactly where it was left.
 */

export interface SpectatorInput {
  /** x strafes starboard, y is the keyboard's forward axis: -1 is ahead. */
  move: Vec2;
  /** +1 rises, -1 sinks. */
  vertical: number;
  sprint: boolean;
}

/** Metres per second at a walk, and the multiplier held Shift applies. */
const CRUISE_SPEED = 16;
const SPRINT_MULTIPLIER = 5;
/** How quickly the camera reaches commanded speed. Low enough to feel weighty. */
const RESPONSE = 9;

export class SpectatorCamera {
  private readonly position = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();

  /**
   * Take over from wherever the first-person camera is standing, so entering
   * spectator mode never teleports and the view is continuous.
   */
  enterFrom(camera: THREE.PerspectiveCamera, originId: string): void {
    renderToShip(camera.position, originId, this.position);
    this.velocity.set(0, 0, 0);
  }

  /** Where the camera is, in ship space, for the HUD readout. */
  shipPosition(target = new THREE.Vector3()): THREE.Vector3 {
    return target.copy(this.position);
  }

  /**
   * Integrate one frame and write the camera.
   *
   * Movement is taken in the camera's own frame including pitch, so looking down
   * and pushing forward descends — the behaviour every editor fly-cam has, and
   * the only way to get under the counter without a separate control.
   */
  update(
    camera: THREE.PerspectiveCamera,
    input: SpectatorInput,
    yaw: number,
    pitch: number,
    delta: number,
    originId: string,
  ): void {
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, 0);

    const forward = this.scratch.set(0, 0, -1).applyEuler(camera.rotation);
    const right = new THREE.Vector3(1, 0, 0).applyEuler(camera.rotation);
    const speed = CRUISE_SPEED * (input.sprint ? SPRINT_MULTIPLIER : 1);

    const wanted = new THREE.Vector3()
      .addScaledVector(forward, -input.move.y)
      .addScaledVector(right, input.move.x);
    // Up stays world-up whatever the camera is doing, so the rise key is always
    // "away from the sea" rather than "away from my feet".
    wanted.y += input.vertical;
    if (wanted.lengthSq() > 1) wanted.normalize();
    wanted.multiplyScalar(speed);

    // Exponential approach: frame-rate independent, and it settles rather than
    // stopping dead, which reads far better at 80 m/s than a hard cut.
    const blend = 1 - Math.exp(-RESPONSE * delta);
    this.velocity.lerp(wanted, blend);
    this.position.addScaledVector(this.velocity, delta);

    shipToRender(this.position, originId, camera.position);
  }
}
