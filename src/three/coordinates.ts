import * as THREE from 'three';
import { compartmentById, defaultCompartmentId } from '../data/ship-layout';
import { simToShip } from '../sim/compartment-space';
import type { Vec2 } from '../sim/types';

/**
 * One simulation unit is one metre, so radii, reaches and speeds in `src/sim`
 * are already physical and need no scaling here.
 *
 * What this module does is choose the render origin. `CompartmentStreamer`
 * places every resident compartment offset by its anchor relative to the
 * occupied one, which puts the render world in ship space translated so that
 * the occupied compartment's anchor sits at (0, 0, 0). A position therefore has
 * to be resolved through the compartment it belongs to and then rebased onto
 * whichever compartment the local crew member is standing in.
 */
export const CABIN_SCALE = 1;

/**
 * Ship-space position of a playfield point, rebased onto the render origin.
 *
 * `compartmentId` is the compartment the thing stands in; `originId` is the one
 * the camera streams from. Passing the same value for both is the common case
 * and gives that compartment's own local frame.
 */
export function cabinToWorld(
  position: Vec2,
  height = 0,
  compartmentId: string = defaultCompartmentId,
  originId: string = defaultCompartmentId,
): THREE.Vector3 {
  const compartment = compartmentById(compartmentId) ?? compartmentById(defaultCompartmentId);
  const origin = compartmentById(originId) ?? compartment;
  if (!compartment || !origin) return new THREE.Vector3(position.x, height, position.y);
  const point = simToShip(compartment, position, height);
  return new THREE.Vector3(
    (point.x - origin.anchor.x) * CABIN_SCALE,
    (point.y - origin.anchor.y) * CABIN_SCALE,
    (point.z - origin.anchor.z) * CABIN_SCALE,
  );
}

/**
 * Rebase a point already in ship space onto the render origin.
 *
 * `cabinToWorld` resolves a playfield coordinate through its compartment first;
 * this is the same rebasing for things that are already stated against the
 * ship — the exterior, and the free camera, which flies in ship space so it
 * keeps its place when the crew below it walks into another compartment.
 */
export function shipToRender(
  point: THREE.Vector3,
  originId: string = defaultCompartmentId,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const origin = compartmentById(originId) ?? compartmentById(defaultCompartmentId);
  if (!origin) return target.copy(point);
  return target.set(
    (point.x - origin.anchor.x) * CABIN_SCALE,
    (point.y - origin.anchor.y) * CABIN_SCALE,
    (point.z - origin.anchor.z) * CABIN_SCALE,
  );
}

/** The inverse of `shipToRender`: a rendered point back in ship space. */
export function renderToShip(
  point: THREE.Vector3,
  originId: string = defaultCompartmentId,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const origin = compartmentById(originId) ?? compartmentById(defaultCompartmentId);
  if (!origin) return target.copy(point);
  return target.set(
    point.x / CABIN_SCALE + origin.anchor.x,
    point.y / CABIN_SCALE + origin.anchor.y,
    point.z / CABIN_SCALE + origin.anchor.z,
  );
}

/**
 * The playfield x of a compartment's centreline, for the few places that ask
 * "is this to port or to starboard" rather than "where is this".
 */
export function centrelineX(compartmentId: string = defaultCompartmentId): number {
  return (compartmentById(compartmentId)?.size.x ?? 24) / 2;
}
