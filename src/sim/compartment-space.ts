import {
  DECK_PITCH,
  type CompartmentDefinition,
  type PortalDefinition,
  compartmentById,
} from '../data/ship-layout';
import type { Vec2 } from './types';

/**
 * The map between the simulation's flat playfield and the ship.
 *
 * The simulation is deliberately two-dimensional: crew, loose objects and
 * guests all live on an XY plane in metres. A cruise ship is not flat, so this
 * module is where the two meet, and it is the only place that knows how.
 *
 * An ordinary compartment is the easy case — its playfield is its own floor,
 * and the mapping is a translation. A stair tower is the interesting one. It is
 * a shaft twelve metres fore-and-aft that rises through as many as ten decks,
 * and the crew has to be able to walk up it. So a tower's playfield is its
 * flights *unrolled*: walking forward along the playfield walks up the stairs,
 * and the map folds that walk back into a switchback inside the real shaft.
 * Nobody has to give the simulation a Z axis for the ship to be climbable.
 *
 * Each deck the tower serves takes one `FLIGHT_RUN` of playfield, and that run
 * is in two parts. The first `LANDING_DEPTH` is the landing: flat, at the deck's
 * own height, running aft to forward across the shaft. The rest is the flight up
 * to the next landing, running forward to aft as it climbs. The crew therefore
 * doubles back at every deck, exactly as they would on a real ship, and the
 * whole climb stays inside twelve metres.
 *
 * Doors open off landings, never off flights. That is not decoration: a door
 * mapped onto a flight would sit metres above or below the deck it claims to
 * serve, and the crew would step out of the tower into thin air.
 *
 * Landings span the shaft; flights climb in a well hard to starboard. Without
 * that split a flight would rise directly under the landing plate above it,
 * with a metre and a half of headroom at mid-flight and nowhere to put the
 * treads. The mapping steers the crew into the well over the first fifth of a
 * flight and leaves x untouched everywhere else, so no doorway moves.
 */

/** Playfield length consumed by one landing-and-flight of a stair tower. */
export const FLIGHT_RUN = 6;
/** Playfield length the landing itself takes, before the flight above it. */
export const LANDING_DEPTH = 2.4;
/** Half the fore-and-aft travel of a landing or flight inside the shaft, in metres. */
export const SWITCHBACK_HALF_Z = 6;
/** How much of that travel the treads actually climb over, in metres. */
export const CLIMB_RUN_Z = 5;
/** Centre and half-width of the stairwell the flights climb in, in metres. */
export const WELL_CENTRE_X = 4.3;
export const WELL_HALF_X = 1.2;
/** Fraction of a flight spent stepping off the landing into the well. */
const WELL_ENTRY = 0.2;

export interface Playfield {
  width: number;
  length: number;
}

export interface ShipPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * The landing heights a stair tower serves, low to high, or null if it is not
 * one.
 *
 * Every deck the shaft passes gets a landing, not only the decks with a door on
 * them. A tower that only landed where it had doors would have to climb 9.6 m
 * in one flight between the promenade and the pool deck, which is a ladder
 * rather than a staircase and cannot be built at a walkable pitch. Landing on
 * every deck makes every flight identical, which is what lets one piece of
 * geometry serve all three towers.
 */
export function stairLandings(compartment: CompartmentDefinition): number[] | null {
  if (compartment.decksTall < 2) return null;
  // A tall room is not a tower. What makes a tower is doors on more than one
  // level: the atrium is four decks of void with every door on its own floor,
  // and unrolling it would be nonsense.
  const doorHeights = new Set(compartment.portals.map((portal) => portal.position.y));
  if (doorHeights.size < 2) return null;
  const levels = Math.floor((compartment.size.y - 1e-6) / DECK_PITCH) + 1;
  if (levels < 2) return null;
  return Array.from({ length: levels }, (_, level) => level * DECK_PITCH);
}

/** The flat extent the simulation clamps a crew member to inside a compartment. */
export function playfieldOf(compartment: CompartmentDefinition): Playfield {
  const landings = stairLandings(compartment);
  if (landings) return { width: compartment.size.x, length: landings.length * FLIGHT_RUN };
  return { width: compartment.size.x, length: compartment.size.z };
}

export function playfieldFor(compartmentId: string): Playfield {
  const compartment = compartmentById(compartmentId);
  return compartment ? playfieldOf(compartment) : { width: 24, length: 46 };
}

/** Which landing of a stair tower a doorway opens off. */
export function landingIndexOf(
  compartment: CompartmentDefinition,
  portal: PortalDefinition,
  landings: number[],
): number {
  return Math.max(
    0,
    landings.findIndex((height) => Math.abs(height - portal.position.y) < 1e-6),
  );
}

/**
 * Where a doorway sits on the compartment's playfield.
 *
 * In a tower every door lands inside its own landing zone, so stepping through
 * it puts the crew at that deck's height and not partway up a flight. The
 * fore-and-aft half of the door's position spreads doors across the landing,
 * which is what separates the two that share one — the galley and the atrium
 * both open off the aft tower at 6.4 m, one through the after bulkhead and one
 * through the forward one.
 */
export function portalSimPosition(
  compartment: CompartmentDefinition,
  portal: PortalDefinition,
): Vec2 {
  const landings = stairLandings(compartment);
  const x = portal.position.x + compartment.size.x / 2;
  if (!landings) return { x, y: portal.position.z + compartment.size.z / 2 };

  const index = landingIndexOf(compartment, portal, landings);
  const half = compartment.size.z / 2;
  const along = (portal.position.z + half) / (half * 2);
  return { x, y: index * FLIGHT_RUN + along * LANDING_DEPTH };
}

/**
 * A playfield position expressed in ship space, relative to the compartment's
 * own anchor. `height` is the crew member's height above the deck they stand on.
 */
export function simToCompartmentLocal(
  compartment: CompartmentDefinition,
  position: Vec2,
  height = 0,
): ShipPoint {
  const landings = stairLandings(compartment);
  const x = position.x - compartment.size.x / 2;
  if (!landings) return { x, y: height, z: position.y - compartment.size.z / 2 };

  const index = Math.min(landings.length - 1, Math.max(0, Math.floor(position.y / FLIGHT_RUN)));
  const along = Math.min(FLIGHT_RUN, Math.max(0, position.y - index * FLIGHT_RUN));
  const here = landings[index] ?? 0;

  if (along <= LANDING_DEPTH) {
    // On the landing: flat, at the deck's own height, walking aft to forward.
    const across = along / LANDING_DEPTH;
    return { x, y: here + height, z: -SWITCHBACK_HALF_Z + across * SWITCHBACK_HALF_Z * 2 };
  }

  // On the flight: climbing to the next landing while walking back forward to
  // aft, so the crew arrives at the far end ready to cross the next landing.
  //
  // Two details keep the flight buildable rather than merely monotonic. It
  // climbs over `CLIMB_RUN_Z` instead of the whole shaft, so the treads sit at
  // a stair's pitch and the top of the flight is clear of the plate above it;
  // and it is pulled into the stairwell hard to starboard, so the landing
  // plates can span the rest of the shaft without burying the steps.
  const next = landings[Math.min(landings.length - 1, index + 1)] ?? here;
  const frac = (along - LANDING_DEPTH) / (FLIGHT_RUN - LANDING_DEPTH);
  const z = SWITCHBACK_HALF_Z - frac * SWITCHBACK_HALF_Z * 2;
  const climb = Math.min(1, (SWITCHBACK_HALF_Z - z) / CLIMB_RUN_Z);
  const blend = Math.min(1, frac / WELL_ENTRY);
  const across = position.x / compartment.size.x - 0.5;
  const well = WELL_CENTRE_X + across * 2 * WELL_HALF_X;
  return {
    x: x + (well - x) * blend,
    y: here + (next - here) * climb + height,
    z,
  };
}

/**
 * The camera yaw that walking along playfield +y actually points the crew at.
 *
 * On an ordinary deck the answer is always the same — playfield +y is ship +z,
 * so the playfield and the world agree and this is a constant. It exists for the
 * stair towers, where they do not. A tower's playfield is its flights unrolled,
 * and unrolling reverses direction at every landing: the landing runs aft to
 * forward, the flight above it runs forward to aft. Walking "forward" on the
 * playfield therefore flips the crew's world-space direction twice per deck.
 *
 * Left alone that is what makes the stairs unreadable. The controller turns the
 * player's stick into playfield motion using the camera's yaw, which silently
 * assumes the two frames agree; inside a tower they do not, so holding forward
 * sends the crew whichever way the mapping happens to face rather than the way
 * they are looking. Feeding this heading back into that conversion puts the two
 * frames back in step, and the switchback is felt as a climb instead of as the
 * controls inverting.
 *
 * Derived from the mapping by finite difference rather than restated, so it
 * cannot drift out of agreement with `simToCompartmentLocal`.
 */
export function playfieldHeading(compartment: CompartmentDefinition, position: Vec2): number {
  // Three cameras look down local -Z, so the direction a yaw faces is
  // (-sin, -cos) and a heading of PI faces ship +z. That is the flat-deck case,
  // and returning it unchanged leaves every ordinary compartment as it was.
  if (!stairLandings(compartment)) return Math.PI;

  // The difference has to stay on the one side of the landing lip the crew is
  // actually standing on. Straddling it averages the landing's direction with
  // the flight's, which are opposite, and the average points nowhere in
  // particular — the controls would invert for one stride at every deck.
  const step = 0.05;
  const along = position.y - Math.floor(position.y / FLIGHT_RUN) * FLIGHT_RUN;
  const room = along < LANDING_DEPTH ? LANDING_DEPTH - along : FLIGHT_RUN - along;
  const used = along < LANDING_DEPTH ? along : along - LANDING_DEPTH;
  const ahead = simToCompartmentLocal(compartment, {
    x: position.x,
    y: position.y + (room > step ? step : 0),
  });
  const behind = simToCompartmentLocal(compartment, {
    x: position.x,
    y: position.y - (used > step ? step : 0),
  });
  const dx = ahead.x - behind.x;
  const dz = ahead.z - behind.z;
  if (Math.abs(dx) + Math.abs(dz) < 1e-6) return Math.PI;
  return Math.atan2(-dx, -dz);
}

/**
 * Which way to look on arriving somewhere: into the room, with the door behind.
 *
 * Stepping through a doorway and finding yourself nose to the bulkhead you just
 * came through reads as a bug even when the position is right, so the walk from
 * the doorway to `arrivalPosition` is also the direction to face.
 */
export function arrivalHeading(destination: CompartmentDefinition, from: string): number {
  const portal = destination.portals.find((entry) => entry.target === from);
  if (!portal) return Math.PI;
  const door = portalSimPosition(destination, portal);
  const inside = arrivalPosition(destination, from);
  const dx = inside.x - door.x;
  const dy = inside.y - door.y;
  if (Math.hypot(dx, dy) < 1e-3) return playfieldHeading(destination, inside);

  // The step inward is expressed on the playfield, so it has to be carried
  // through the same mapping as everything else before it means a world yaw.
  const local = simToCompartmentLocal(destination, inside);
  const outward = simToCompartmentLocal(destination, door);
  const wx = local.x - outward.x;
  const wz = local.z - outward.z;
  if (Math.abs(wx) + Math.abs(wz) < 1e-6) return playfieldHeading(destination, inside);
  return Math.atan2(-wx, -wz);
}

/** The same point in ship space proper, ready to compare against the hull. */
export function simToShip(
  compartment: CompartmentDefinition,
  position: Vec2,
  height = 0,
): ShipPoint {
  const local = simToCompartmentLocal(compartment, position, height);
  return {
    x: compartment.anchor.x + local.x,
    y: compartment.anchor.y + local.y,
    z: compartment.anchor.z + local.z,
  };
}

/**
 * Where a crew member lands after walking through a door: just inside the
 * destination, clear of the doorway they arrived by, so they do not immediately
 * trip it in reverse.
 *
 * A stair tower is stepped into sideways rather than forward. Stepping forward
 * off a landing means stepping onto the flight above it, so the crew would
 * arrive already climbing; stepping athwartships keeps them on the landing and
 * still puts a comfortable margin between them and the doors that share it.
 */
export function arrivalPosition(destination: CompartmentDefinition, from: string): Vec2 {
  const portal = destination.portals.find((entry) => entry.target === from);
  const field = playfieldOf(destination);
  const centre = { x: field.width / 2, y: field.length / 2 };
  if (!portal) return centre;
  const door = portalSimPosition(destination, portal);
  const step = 2.2;

  if (stairLandings(destination)) {
    const across = door.x <= centre.x ? step : -step;
    return {
      x: Math.min(field.width - 1.4, Math.max(1.4, door.x + across)),
      y: Math.min(field.length - 1.4, Math.max(1.4, door.y)),
    };
  }

  const toCentre = { x: centre.x - door.x, y: centre.y - door.y };
  const span = Math.hypot(toCentre.x, toCentre.y);
  if (span < 1e-3) return door;
  return {
    x: Math.min(field.width - 1.4, Math.max(1.4, door.x + (toCentre.x / span) * step)),
    y: Math.min(field.length - 1.4, Math.max(1.4, door.y + (toCentre.y / span) * step)),
  };
}
