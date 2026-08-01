import { phaseOneCabinDefinition, phaseOneCabinDefinitionSchema } from '../src/data/phase-one';

const result = phaseOneCabinDefinitionSchema.safeParse(phaseOneCabinDefinition);
const ids = phaseOneCabinDefinition.objects.map((object) => object.id);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
const outsideCabin = phaseOneCabinDefinition.objects.filter(
  (object) =>
    object.position.x - object.radius < 0 ||
    object.position.x + object.radius > phaseOneCabinDefinition.width ||
    object.position.y - object.radius < 0 ||
    object.position.y + object.radius > phaseOneCabinDefinition.length,
);

if (!result.success || duplicateIds.length > 0 || outsideCabin.length > 0) {
  if (!result.success) console.error(result.error.issues);
  if (duplicateIds.length > 0) console.error(`Duplicate object IDs: ${duplicateIds.join(', ')}`);
  if (outsideCabin.length > 0) {
    console.error(`Objects outside cabin: ${outsideCabin.map((object) => object.id).join(', ')}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Data valid: ${result.data.id} (${result.data.objects.length} Phase 1 objects).`);
}
