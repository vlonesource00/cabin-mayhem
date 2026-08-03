# Content Authoring

Base cabin object definitions live in validated `src/data/phase-one.ts`. Slice 2 passengers, requests and service props live in validated `src/data/service.ts`. Future cargo, event, route, weather and upgrade definitions also belong in focused `src/data/` files.

Authored emergency definitions live in `src/data/emergencies.ts`. The galley-fire definition records its stable ID, local cabin position, radius and initial intensity; the coffee-machine repair definition records its stable hotspot, required toolbox, hold duration and pressure/score behavior. Mutable fire and repair status stays in `src/sim/fire-response.ts` and `src/sim/repair-response.ts`.

Every definition needs a stable ID, display name, authored limits and explicit resolution/cleanup behavior. Passenger definitions require a seat position, reachable aisle-side service position, request type and schedule. Service props with a need mapping are cart inventory templates; their authored count sets initial stock/capacity, while props without a need mapping spawn loose. Validation must reject duplicate IDs, out-of-cabin positions, missing references, invalid seats and events with no resolution path.

Use only project-owned, licensed or generated assets. The tracked Blender source and generated static cabin GLB are catalogued in `docs/assets.md`; register every shipped file asset in `public/assets/manifest.json` with source, runtime use, owner and license. Do not treat a visual GLB as authoritative for interaction or collision: keep those contracts in validated data and host simulation rules.
