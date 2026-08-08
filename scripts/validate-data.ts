import { phaseOneCabinDefinition, phaseOneCabinDefinitionSchema } from '../src/data/phase-one';
import {
  galleyFireDefinition,
  galleyFireDefinitionSchema,
  galleyRepairDefinition,
  galleyRepairDefinitionSchema,
} from '../src/data/emergencies';
import { serviceSliceDefinition, serviceSliceDefinitionSchema } from '../src/data/service';
import {
  AIR_DRAUGHT,
  BEAM,
  DECK_PITCH,
  DRAUGHT,
  LOA,
  deckFloorY,
  portalWorldPosition,
  shipLayout,
  shipLayoutSchema,
} from '../src/data/ship-layout';
import {
  arrivalPosition,
  playfieldOf,
  portalSimPosition,
  simToShip,
} from '../src/sim/compartment-space';
import { cabinFixtures } from '../src/sim/cabin-simulation';

const result = phaseOneCabinDefinitionSchema.safeParse(phaseOneCabinDefinition);
const serviceResult = serviceSliceDefinitionSchema.safeParse(serviceSliceDefinition);
const fireResult = galleyFireDefinitionSchema.safeParse(galleyFireDefinition);
const repairResult = galleyRepairDefinitionSchema.safeParse(galleyRepairDefinition);
const allObjects = [...phaseOneCabinDefinition.objects, ...serviceSliceDefinition.objects];
const ids = allObjects.map((object) => object.id);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
const outsideCabin = allObjects.filter(
  (object) =>
    object.position.x - object.radius < 0 ||
    object.position.x + object.radius > phaseOneCabinDefinition.width ||
    object.position.y - object.radius < 0 ||
    object.position.y + object.radius > phaseOneCabinDefinition.length,
);

const layoutResult = shipLayoutSchema.safeParse(shipLayout);

// A portal the crew can walk through but not walk back out of is a trap, so
// every link has to be declared from both sides.
const compartmentIds = new Set(shipLayout.compartments.map((compartment) => compartment.id));
const danglingPortals: string[] = [];
const asymmetricPortals: string[] = [];
for (const compartment of shipLayout.compartments) {
  for (const portal of compartment.portals) {
    if (!compartmentIds.has(portal.target)) {
      danglingPortals.push(`${compartment.id} -> ${portal.target}`);
      continue;
    }
    const target = shipLayout.compartments.find((entry) => entry.id === portal.target);
    if (!target?.portals.some((back) => back.target === compartment.id)) {
      asymmetricPortals.push(`${compartment.id} -> ${portal.target}`);
    }
  }
}

const duplicateCompartments = shipLayout.compartments
  .map((compartment) => compartment.id)
  .filter((id, index, all) => all.indexOf(id) !== index);

// Three geometric invariants keep the layout a ship rather than a bag of boxes.
// The old four-room stand-in violated all three: the bridge sat 68 m from the
// doorway it claimed to share with the atrium, and no compartment was checked
// against the hull at all.

// 1. Every compartment stands inside the hull envelope.
const outsideHull: string[] = [];
for (const compartment of shipLayout.compartments) {
  const { anchor, size } = compartment;
  const problems: string[] = [];
  if (Math.abs(anchor.x) + size.x / 2 > BEAM / 2 + 1e-6) problems.push('beam');
  if (Math.abs(anchor.z) + size.z / 2 > LOA / 2 + 1e-6) problems.push('length');
  if (anchor.y < -DRAUGHT - 1e-6) problems.push('keel');
  if (anchor.y + size.y > AIR_DRAUGHT + 1e-6) problems.push('air draught');
  if (problems.length > 0) outsideHull.push(`${compartment.id} (${problems.join(', ')})`);
}

// 2. Every floor sits on the deck pitch, so the decks actually stack.
const offDatum = shipLayout.compartments
  .filter((compartment) => Math.abs(compartment.anchor.y - deckFloorY(compartment.deck)) > 1e-6)
  .map(
    (compartment) =>
      `${compartment.id} floor ${compartment.anchor.y} != deck ${compartment.deck} datum ${deckFloorY(compartment.deck)}`,
  );

// 2b. A compartment's height has to match the decks it claims to occupy, or the
// declared stack and the built stack disagree. Exterior decks are exempt: an
// open deck's extent contains masts, canopies and funnel casings, not storeys.
const heightMismatch = shipLayout.compartments
  .filter(
    (compartment) =>
      compartment.exposure === 'interior' &&
      Math.abs(compartment.size.y - compartment.decksTall * DECK_PITCH) > 0.45,
  )
  .map(
    (compartment) =>
      `${compartment.id} is ${compartment.size.y} m tall but claims ${compartment.decksTall} deck(s)`,
  );

// 2c. An open deck is glazed by definition — the crew standing on it is outside.
// Declaring one unglazed would send the exterior to tier X2 and delete the ship
// from under the player's feet, which is invisible in the data and glaring in
// the game. See exteriorTier in src/data/ship-layout.ts.
const unglazedOpenDecks = shipLayout.compartments
  .filter((compartment) => compartment.exposure === 'exterior' && !compartment.glazed)
  .map((compartment) => `${compartment.id} is an open deck but is declared unglazed`);

// 3. Both halves of a portal pair name the same point in the ship. Without this
// a door is a teleport, and the vessel stops being a place.
const misalignedPortals: string[] = [];
for (const compartment of shipLayout.compartments) {
  for (const portal of compartment.portals) {
    const target = shipLayout.compartments.find((entry) => entry.id === portal.target);
    const back = target?.portals.find((entry) => entry.target === compartment.id);
    if (!target || !back) continue;
    const here = portalWorldPosition(compartment, portal);
    const there = portalWorldPosition(target, back);
    const gap = Math.hypot(here.x - there.x, here.y - there.y, here.z - there.z);
    if (gap > 0.05) {
      misalignedPortals.push(
        `${compartment.id} <-> ${portal.target} doorways are ${gap.toFixed(2)} m apart`,
      );
    }
  }
}

// A doorway also has to be on the compartment's own boundary or inside it.
const portalsOutsideRoom: string[] = [];
for (const compartment of shipLayout.compartments) {
  for (const portal of compartment.portals) {
    const { position } = portal;
    const inside =
      Math.abs(position.x) <= compartment.size.x / 2 + 0.05 &&
      Math.abs(position.z) <= compartment.size.z / 2 + 0.05 &&
      position.y >= -0.05 &&
      position.y <= compartment.size.y + 0.05;
    if (!inside) portalsOutsideRoom.push(`${compartment.id} -> ${portal.target}`);
  }
}

// 4. The doors have to work as gameplay, not only as geometry. The simulation
// trips a doorway within `portalReach` of it and holds the crew a wall
// clearance off every bulkhead, so a door outside that margin is decoration,
// and a door within reach of where another door drops you is an infinite loop.
const PORTAL_REACH = 1.6;
const PLAYER_RADIUS = 0.58;
const WALL_CLEARANCE = 0.8 + PLAYER_RADIUS;

const unreachableDoors: string[] = [];
const doorLoops: string[] = [];
for (const compartment of shipLayout.compartments) {
  const field = playfieldOf(compartment);
  for (const portal of compartment.portals) {
    const door = portalSimPosition(compartment, portal);
    const nearest = {
      x: Math.min(field.width - WALL_CLEARANCE, Math.max(WALL_CLEARANCE, door.x)),
      y: Math.min(field.length - WALL_CLEARANCE, Math.max(WALL_CLEARANCE, door.y)),
    };
    const stand = Math.hypot(nearest.x - door.x, nearest.y - door.y);
    if (stand > PORTAL_REACH) {
      unreachableDoors.push(
        `${compartment.id} -> ${portal.target} is ${stand.toFixed(2)} m past where the crew can stand`,
      );
    }

    const destination = shipLayout.compartments.find((entry) => entry.id === portal.target);
    if (!destination) continue;
    const landing = arrivalPosition(destination, compartment.id);
    for (const onward of destination.portals) {
      if (onward.target === compartment.id) continue;
      const other = portalSimPosition(destination, onward);
      const gap = Math.hypot(landing.x - other.x, landing.y - other.y);
      if (gap <= PORTAL_REACH) {
        doorLoops.push(
          `${compartment.id} -> ${destination.id} lands ${gap.toFixed(2)} m from the ${onward.target} door`,
        );
      }
    }
  }
}

// 5. Furniture must not wall the crew in. The atrium is the only compartment
// whose fixtures the simulation collides against so far, and both of its doors
// open on the centreline, so a counter spanning the full beam would seal the
// room. A doorway is usable only if some point the crew can actually stand on
// lies within reach of it.
const blockedDoors: string[] = [];
const atrium = shipLayout.compartments.find((compartment) => compartment.id === 'atrium');
if (atrium) {
  const field = playfieldOf(atrium);
  for (const portal of atrium.portals) {
    const door = portalSimPosition(atrium, portal);
    let standable = false;
    for (let ix = 0; ix <= 32 && !standable; ix += 1) {
      for (let iy = 0; iy <= 32 && !standable; iy += 1) {
        const x = WALL_CLEARANCE + (ix / 32) * (field.width - WALL_CLEARANCE * 2);
        const y = WALL_CLEARANCE + (iy / 32) * (field.length - WALL_CLEARANCE * 2);
        if (Math.hypot(x - door.x, y - door.y) > PORTAL_REACH) continue;
        const blocked = cabinFixtures.some(
          (fixture) =>
            x > fixture.minX - PLAYER_RADIUS &&
            x < fixture.maxX + PLAYER_RADIUS &&
            y > fixture.minY - PLAYER_RADIUS &&
            y < fixture.maxY + PLAYER_RADIUS,
        );
        if (!blocked) standable = true;
      }
    }
    if (!standable) blockedDoors.push(`atrium -> ${portal.target} is walled off by furniture`);
  }
}

// 6. The flat playfield and the stacked ship have to name the same doorway. In
// a stair tower the crew walks up a shaft that the simulation only knows as a
// straight line, so a door mapped onto a flight rather than a landing would sit
// metres above the deck it serves and the crew would step out into the air.
const driftingDoors: string[] = [];
for (const compartment of shipLayout.compartments) {
  for (const portal of compartment.portals) {
    const mapped = simToShip(compartment, portalSimPosition(compartment, portal));
    const authored = portalWorldPosition(compartment, portal);
    const drift = Math.hypot(mapped.x - authored.x, mapped.y - authored.y, mapped.z - authored.z);
    if (drift > 0.05) {
      driftingDoors.push(
        `${compartment.id} -> ${portal.target} maps ${drift.toFixed(2)} m off where it is built`,
      );
    }
  }
}

const passengerIds = serviceSliceDefinition.passengers.map((passenger) => passenger.id);
const duplicatePassengers = passengerIds.filter((id, index) => passengerIds.indexOf(id) !== index);

if (
  !result.success ||
  !serviceResult.success ||
  !fireResult.success ||
  !repairResult.success ||
  !layoutResult.success ||
  duplicateIds.length > 0 ||
  duplicatePassengers.length > 0 ||
  duplicateCompartments.length > 0 ||
  danglingPortals.length > 0 ||
  asymmetricPortals.length > 0 ||
  outsideHull.length > 0 ||
  offDatum.length > 0 ||
  heightMismatch.length > 0 ||
  unglazedOpenDecks.length > 0 ||
  misalignedPortals.length > 0 ||
  portalsOutsideRoom.length > 0 ||
  unreachableDoors.length > 0 ||
  doorLoops.length > 0 ||
  blockedDoors.length > 0 ||
  driftingDoors.length > 0 ||
  outsideCabin.length > 0
) {
  if (!result.success) console.error(result.error.issues);
  if (!serviceResult.success) console.error(serviceResult.error.issues);
  if (!fireResult.success) console.error(fireResult.error.issues);
  if (!repairResult.success) console.error(repairResult.error.issues);
  if (!layoutResult.success) console.error(layoutResult.error.issues);
  if (duplicateCompartments.length > 0)
    console.error(`Duplicate compartment IDs: ${duplicateCompartments.join(', ')}`);
  if (danglingPortals.length > 0)
    console.error(`Portals pointing at unknown compartments: ${danglingPortals.join(', ')}`);
  if (asymmetricPortals.length > 0)
    console.error(`Portals with no return link: ${asymmetricPortals.join(', ')}`);
  if (outsideHull.length > 0)
    console.error(`Compartments outside the hull envelope: ${outsideHull.join('; ')}`);
  if (offDatum.length > 0) console.error(`Compartments off the deck datum: ${offDatum.join('; ')}`);
  if (heightMismatch.length > 0)
    console.error(
      `Compartment heights disagree with their deck count: ${heightMismatch.join('; ')}`,
    );
  if (unglazedOpenDecks.length > 0)
    console.error(
      `Open decks that would hide the ship's exterior: ${unglazedOpenDecks.join('; ')}`,
    );
  if (misalignedPortals.length > 0)
    console.error(`Portal pairs that do not meet in ship space: ${misalignedPortals.join('; ')}`);
  if (portalsOutsideRoom.length > 0)
    console.error(`Doorways outside their own compartment: ${portalsOutsideRoom.join(', ')}`);
  if (unreachableDoors.length > 0)
    console.error(`Doorways the crew cannot reach: ${unreachableDoors.join('; ')}`);
  if (doorLoops.length > 0)
    console.error(`Doorways that drop the crew into another doorway: ${doorLoops.join('; ')}`);
  if (blockedDoors.length > 0)
    console.error(`Doorways furniture stands across: ${blockedDoors.join('; ')}`);
  if (driftingDoors.length > 0)
    console.error(
      `Doorways the playfield maps off the deck they serve: ${driftingDoors.join('; ')}`,
    );
  if (duplicateIds.length > 0) console.error(`Duplicate object IDs: ${duplicateIds.join(', ')}`);
  if (duplicatePassengers.length > 0)
    console.error(`Duplicate passenger IDs: ${duplicatePassengers.join(', ')}`);
  if (outsideCabin.length > 0) {
    console.error(`Objects outside cabin: ${outsideCabin.map((object) => object.id).join(', ')}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Data valid: ${result.data.id} (${allObjects.length} objects, ${serviceSliceDefinition.passengers.length} passengers, ${shipLayout.compartments.length} compartments on ${new Set(shipLayout.compartments.map((c) => c.deck)).size} decks, all inside a ${LOA} x ${BEAM} m hull, ${shipLayout.compartments.reduce((total, c) => total + c.portals.length, 0)} doorways paired, reachable and loop-free).`,
  );
}
