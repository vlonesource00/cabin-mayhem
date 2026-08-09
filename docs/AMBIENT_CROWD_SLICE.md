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

## Evidence

- `tests/unit/ambient-crowd.test.ts` proves deterministic population, movement,
  bounded routes and evacuation transitions.
- `tests/unit/ambient-crowd-presenter.test.ts` proves every activity resolves to
  an authored GLB clip.
- host and peer-room tests prove host ownership and strict snapshot validation.
- the Playwright crowd test renders 12 pool-deck residents and writes
  `test-results/crowd-evidence/pool-deck-cruise-crowd.png`.

This is the crowd foundation, not a claim that the full resort simulation is
finished. Cross-compartment schedules, conversations, shopping transactions,
job-specific NPC cooperation, combat reactions and crowd LOD/streaming polish
remain future work.
