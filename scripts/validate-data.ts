import { phaseOneCabinDefinition, phaseOneCabinDefinitionSchema } from '../src/data/phase-one';
import {
  galleyFireDefinition,
  galleyFireDefinitionSchema,
  galleyRepairDefinition,
  galleyRepairDefinitionSchema,
} from '../src/data/emergencies';
import { serviceSliceDefinition, serviceSliceDefinitionSchema } from '../src/data/service';

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

const passengerIds = serviceSliceDefinition.passengers.map((passenger) => passenger.id);
const duplicatePassengers = passengerIds.filter((id, index) => passengerIds.indexOf(id) !== index);

if (
  !result.success ||
  !serviceResult.success ||
  !fireResult.success ||
  !repairResult.success ||
  duplicateIds.length > 0 ||
  duplicatePassengers.length > 0 ||
  outsideCabin.length > 0
) {
  if (!result.success) console.error(result.error.issues);
  if (!serviceResult.success) console.error(serviceResult.error.issues);
  if (!fireResult.success) console.error(fireResult.error.issues);
  if (!repairResult.success) console.error(repairResult.error.issues);
  if (duplicateIds.length > 0) console.error(`Duplicate object IDs: ${duplicateIds.join(', ')}`);
  if (duplicatePassengers.length > 0)
    console.error(`Duplicate passenger IDs: ${duplicatePassengers.join(', ')}`);
  if (outsideCabin.length > 0) {
    console.error(`Objects outside cabin: ${outsideCabin.map((object) => object.id).join(', ')}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Data valid: ${result.data.id} (${allObjects.length} objects, ${serviceSliceDefinition.passengers.length} passengers).`,
  );
}
