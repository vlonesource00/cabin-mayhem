import { describe, expect, it } from 'vitest';
import {
  DECK_PITCH,
  compartmentById,
  shipLayout,
  type CompartmentDefinition,
} from '../../src/data/ship-layout';
import {
  FLIGHT_RUN,
  LANDING_DEPTH,
  arrivalHeading,
  arrivalPosition,
  playfieldHeading,
  playfieldOf,
  portalSimPosition,
  simToCompartmentLocal,
  simToShip,
  stairLandings,
} from '../../src/sim/compartment-space';
import { playfieldRelativeMovement } from '../../src/three/first-person-controller';
import type { PlayerState, Vec2 } from '../../src/sim/types';

describe('compartment space', () => {
  it('gives an ordinary compartment its own floor as the playfield', () => {
    const dining = compartmentById('dining-room')!;
    expect(stairLandings(dining)).toBeNull();
    expect(playfieldOf(dining)).toEqual({ width: dining.size.x, length: dining.size.z });
  });

  it('unrolls a stair tower into one flight per deck it passes', () => {
    const tower = compartmentById('stairwell-aft')!;
    const landings = stairLandings(tower)!;
    // Thirty-two metres of shaft at a 3.2 m deck pitch: ten landings, the last
    // one a deck below the deckhead. Every flight is therefore the same climb,
    // which is the only way one staircase fits all three towers.
    expect(landings).toHaveLength(10);
    expect(landings[0]).toBe(0);
    expect(landings.at(-1)).toBeCloseTo(tower.size.y - DECK_PITCH, 6);
    for (let index = 1; index < landings.length; index += 1) {
      expect(landings[index]! - landings[index - 1]!).toBeCloseTo(DECK_PITCH, 6);
    }
    expect(playfieldOf(tower).length).toBe(landings.length * FLIGHT_RUN);
    // Every door still opens off a landing rather than partway up a flight.
    for (const portal of tower.portals) {
      expect(landings.some((height) => Math.abs(height - portal.position.y) < 1e-6)).toBe(true);
    }
  });

  it('walking up the unrolled flights climbs the real shaft', () => {
    const tower = compartmentById('stairwell-aft')!;
    const landings = stairLandings(tower)!;
    const foot = simToShip(tower, { x: 5.5, y: 0 });
    const head = simToShip(tower, { x: 5.5, y: playfieldOf(tower).length });

    expect(foot.y).toBeCloseTo(tower.anchor.y + landings[0]!, 6);
    expect(head.y).toBeCloseTo(tower.anchor.y + landings.at(-1)!, 6);
    // The climb is monotonic, so the crew never walks forward and descends.
    let previous = -Infinity;
    for (let step = 0; step <= 40; step += 1) {
      const here = simToShip(tower, { x: 5.5, y: (step / 40) * playfieldOf(tower).length });
      expect(here.y).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = here.y;
    }
  });

  it('folds the whole climb into the shaft it is authored in', () => {
    for (const compartment of shipLayout.compartments) {
      const field = playfieldOf(compartment);
      for (let step = 0; step <= 30; step += 1) {
        const point = simToShip(compartment, { x: field.width / 2, y: (step / 30) * field.length });
        expect(Math.abs(point.z - compartment.anchor.z)).toBeLessThanOrEqual(
          compartment.size.z / 2 + 1e-6,
        );
        expect(point.y).toBeGreaterThanOrEqual(compartment.anchor.y - 1e-6);
        expect(point.y).toBeLessThanOrEqual(compartment.anchor.y + compartment.size.y + 1e-6);
      }
    }
  });

  it('puts every doorway at the height it is authored at', () => {
    // A door mapped onto a flight instead of a landing sits metres off the deck
    // it serves, and the crew steps out of the tower into thin air.
    for (const compartment of shipLayout.compartments) {
      for (const portal of compartment.portals) {
        const door = portalSimPosition(compartment, portal);
        const point = simToShip(compartment, door);
        expect(point.y).toBeCloseTo(compartment.anchor.y + portal.position.y, 6);
        expect(point.z).toBeCloseTo(compartment.anchor.z + portal.position.z, 6);
      }
    }
  });

  it('separates two doors that share a landing', () => {
    const tower = compartmentById('stairwell-aft')!;
    // The galley and the atrium both open off deck 2, one aft and one forward.
    const galley = portalSimPosition(
      tower,
      tower.portals.find((p) => p.target === 'main-galley')!,
    );
    const atrium = portalSimPosition(
      tower,
      tower.portals.find((p) => p.target === 'atrium')!,
    );
    expect(Math.hypot(galley.x - atrium.x, galley.y - atrium.y)).toBeGreaterThan(1.6);
  });

  it('drops the crew inside the destination, clear of the door they came by', () => {
    for (const compartment of shipLayout.compartments) {
      for (const portal of compartment.portals) {
        const destination = compartmentById(portal.target)!;
        const field = playfieldOf(destination);
        const landing = arrivalPosition(destination, compartment.id);
        expect(landing.x).toBeGreaterThanOrEqual(1.38);
        expect(landing.x).toBeLessThanOrEqual(field.width - 1.38);
        expect(landing.y).toBeGreaterThanOrEqual(1.38);
        expect(landing.y).toBeLessThanOrEqual(field.length - 1.38);
      }
    }
  });

  /** Where a step along the playfield actually carries you, in the room's own frame. */
  function worldStep(
    compartment: CompartmentDefinition,
    at: Vec2,
    move: Vec2,
  ): { x: number; z: number } {
    const eps = 0.005;
    const here = simToCompartmentLocal(compartment, at);
    const there = simToCompartmentLocal(compartment, {
      x: at.x + move.x * eps,
      y: at.y + move.y * eps,
    });
    return { x: there.x - here.x, z: there.z - here.z };
  }

  /** The shorter way round between two angles. */
  function angleDelta(a: number, b: number): number {
    return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  }

  const standing = (compartmentId: string, position: Vec2): PlayerState =>
    ({ compartmentId, position }) as PlayerState;

  it('leaves a flat deck facing the way it always did', () => {
    // Every ordinary compartment maps playfield +y straight onto ship +z, which
    // a camera at yaw PI is already looking down. Anything else here would move
    // the whole ship out from under the existing controls.
    for (const compartment of shipLayout.compartments) {
      if (stairLandings(compartment)) continue;
      const field = playfieldOf(compartment);
      expect(
        playfieldHeading(compartment, { x: field.width / 2, y: field.length / 2 }),
      ).toBeCloseTo(Math.PI, 6);
    }
  });

  it('reverses the local heading between a landing and the flight above it', () => {
    const tower = compartmentById('stairwell-aft')!;
    // The landing runs aft to forward and the flight doubles back on it, so the
    // two halves of one deck point opposite ways in the world. This is the whole
    // reason walking a stair tower used to fight the camera.
    const onLanding = playfieldHeading(tower, { x: 5.5, y: LANDING_DEPTH / 2 });
    const onFlight = playfieldHeading(tower, {
      x: 5.5,
      y: (LANDING_DEPTH + FLIGHT_RUN) / 2,
    });
    expect(angleDelta(onLanding, Math.PI)).toBeLessThan(1e-3);
    expect(angleDelta(onLanding, onFlight)).toBeCloseTo(Math.PI, 3);
  });

  it('walks the crew the way the camera is pointing, stairs included', () => {
    const tower = compartmentById('stairwell-aft')!;
    const forward = { x: 0, y: -1 };
    // Two decks of shaft, sampled through landings and flights alike, held at a
    // yaw that looks straight down the ship so the sample never crosses the
    // stair well's sideways squeeze.
    // Sampled inside the landings and inside the flights, not across the lips
    // between them. A switchback genuinely turns the crew round at every lip —
    // that is what a switchback is — so the claim being made here is that the
    // controls hold within each run, which is the part that used to fail.
    const runs = [
      { from: 0.05, to: LANDING_DEPTH - 0.05 },
      { from: LANDING_DEPTH + 0.05, to: FLIGHT_RUN - 0.05 },
    ];
    for (const yaw of [0, Math.PI]) {
      const facing = -Math.cos(yaw);
      for (const deck of [0, 1]) {
        for (const run of runs) {
          for (let step = 0; step <= 12; step += 1) {
            const at = {
              x: 5.5,
              y: deck * FLIGHT_RUN + run.from + (step / 12) * (run.to - run.from),
            };
            const command = playfieldRelativeMovement(forward, yaw, standing(tower.id, at));
            expect(Math.sign(worldStep(tower, at, command.move).z)).toBe(Math.sign(facing));
          }
        }
      }
      // Clear of the funnel that draws the landing into the stair well, the
      // correction is a reflection and nothing else: no sideways drift at all.
      for (const y of [LANDING_DEPTH / 2, LANDING_DEPTH + (FLIGHT_RUN - LANDING_DEPTH) * 0.8]) {
        const at = { x: 5.5, y };
        const command = playfieldRelativeMovement(forward, yaw, standing(tower.id, at));
        expect(Math.abs(worldStep(tower, at, command.move).x)).toBeLessThan(1e-9);
      }
    }
  });

  it('turns the view into the room a doorway opens on', () => {
    for (const compartment of shipLayout.compartments) {
      for (const portal of compartment.portals) {
        const destination = compartmentById(portal.target)!;
        const door = simToCompartmentLocal(
          destination,
          portalSimPosition(
            destination,
            destination.portals.find((p) => p.target === compartment.id)!,
          ),
        );
        const inside = simToCompartmentLocal(
          destination,
          arrivalPosition(destination, compartment.id),
        );
        const yaw = arrivalHeading(destination, compartment.id);
        // Facing has to carry the crew away from the bulkhead they arrived
        // through, or every doorway drops them nose-first into a wall.
        const dot = -Math.sin(yaw) * (inside.x - door.x) + -Math.cos(yaw) * (inside.z - door.z);
        expect(dot).toBeGreaterThan(0);
      }
    }
  });
});
