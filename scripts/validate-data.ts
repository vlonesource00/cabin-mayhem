import { phaseOneCabinDefinition, phaseOneCabinDefinitionSchema } from '../src/data/phase-one';
import {
  galleyFireDefinition,
  galleyFireDefinitionSchema,
  galleyRepairDefinition,
  galleyRepairDefinitionSchema,
} from '../src/data/emergencies';
import { serviceSliceDefinition, serviceSliceDefinitionSchema } from '../src/data/service';
import { shipLayout, shipLayoutSchema } from '../src/data/ship-layout';

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
  if (duplicateIds.length > 0) console.error(`Duplicate object IDs: ${duplicateIds.join(', ')}`);
  if (duplicatePassengers.length > 0)
    console.error(`Duplicate passenger IDs: ${duplicatePassengers.join(', ')}`);
  if (outsideCabin.length > 0) {
    console.error(`Objects outside cabin: ${outsideCabin.map((object) => object.id).join(', ')}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Data valid: ${result.data.id} (${allObjects.length} objects, ${serviceSliceDefinition.passengers.length} passengers, ${shipLayout.compartments.length} compartments).`,
  );
}
