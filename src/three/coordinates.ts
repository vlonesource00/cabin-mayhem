import * as THREE from 'three';
import type { Vec2 } from '../sim/types';

/**
 * One simulation unit is one metre. Radii, reaches and speeds in `src/sim` are
 * therefore already physical, and the atrium's 24 x 46 playfield maps onto a
 * 24 m x 46 m room centred on its compartment anchor.
 */
export const CABIN_SCALE = 1;
export const CABIN_CENTER_X = 12;
export const CABIN_FRONT = 23;

export function cabinToWorld(position: Vec2, height = 0): THREE.Vector3 {
  return new THREE.Vector3(
    (position.x - CABIN_CENTER_X) * CABIN_SCALE,
    height,
    (position.y - CABIN_FRONT) * CABIN_SCALE,
  );
}
