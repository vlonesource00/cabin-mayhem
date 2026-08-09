# Ambient cruise crowd slice

The ship now carries 78 deterministic ambient residents across the atrium,
galley, dining room, both cabin decks, promenade, pool deck and sun deck.
`HostSession` owns every position, route, activity and evacuation state. A guest
client receives the same state through the protocol-v3 snapshot and cannot
author crowd motion.

## Activities and presentation

Residents walk, chat, dine, cook, perform housekeeping, sightsee, take requested
photographs, swim and sunbathe. Boarding warning, approach and boarders-aboard
phases change every resident to an evacuation state; leisure resumes after the
threat is repelled or failed.

Only residents in the occupied compartment are rendered. Every visible resident
uses `public/assets/characters/cabin-mayhem-characters.glb`, mesh
`CM_PASSENGER`, and an authored AnimationMixer clip. This reuses the validated
Blender character contract rather than introducing runtime-generated character
art.

Presentation derives one of six stable archetypes from the resident id. Each
archetype changes the passenger silhouette scale, GLB material palette, hair
shape, and a small accessory detail while keeping the body mesh and shared GLB
loading contract intact. Dining and sunbathing use seated authored clips selected
from deterministic per-activity pools; walking, service, swimming and evacuation
retain their activity-specific authored clips.

Seated roots use an explicit seat transform contract: the host position remains
the anchor, the measured `CM_PASSENGER` seated foot contact (`0.357m`) is scaled
by the archetype height, and the root is lowered to the surface before the
presentation layer interpolates position and facing. The authored pelvis drop
(`0.42m`) and surface/yaw offsets stay in the same contract, so seated feet do
not float while animation variants prevent a shared pose.

## Evidence

- `tests/unit/ambient-crowd.test.ts` proves deterministic population, movement,
  bounded routes and evacuation transitions.
- `tests/unit/ambient-crowd-presenter.test.ts` proves every activity resolves to
  an authored GLB clip, stable archetype variety, seated contact, and activity
  presentation state selection.
- host and peer-room tests prove host ownership and strict snapshot validation.
- the Playwright crowd test renders 12 pool-deck residents and writes
  `test-results/crowd-evidence/pool-deck-cruise-crowd.png`, plus a settled close
  framing at `test-results/crowd-evidence/pool-deck-seating-close.png`.

This is the crowd foundation, not a claim that the full resort simulation is
finished. Cross-compartment schedules, conversations, shopping transactions,
job-specific NPC cooperation, combat reactions and crowd LOD/streaming polish
remain future work.
