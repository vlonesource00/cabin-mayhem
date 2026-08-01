import * as THREE from 'three';
import type { Vec2 } from '../sim/types';

export const CABIN_SCALE = 0.5;
export const CABIN_CENTER_X = 8;
export const CABIN_FRONT = 3;

export function cabinToWorld(position: Vec2, height = 0): THREE.Vector3 {
  return new THREE.Vector3(
    (position.x - CABIN_CENTER_X) * CABIN_SCALE,
    height,
    (position.y - CABIN_FRONT) * CABIN_SCALE,
  );
}
