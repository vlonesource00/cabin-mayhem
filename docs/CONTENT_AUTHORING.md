# Content Authoring

Base cabin object definitions live in validated `src/data/phase-one.ts`. Slice 2 passengers, requests and service props live in validated `src/data/service.ts`. Future cargo, event, route, weather and upgrade definitions also belong in focused `src/data/` files.

The first authored emergency hotspot lives in `src/data/emergencies.ts`. Its stable ID, local cabin position, radius and initial intensity define the galley-fire contract; mutable fire status stays in `src/sim/fire-response.ts`.

Every definition needs a stable ID, display name, authored limits and explicit resolution/cleanup behavior. Passenger definitions require a seat position, reachable aisle-side service position, request type and schedule. Service props with a need mapping are cart inventory templates; their authored count sets initial stock/capacity, while props without a need mapping spawn loose. Validation must reject duplicate IDs, out-of-cabin positions, missing references, invalid seats and events with no resolution path.

Use only project-owned, licensed or generated assets. Register every file asset in `public/assets/manifest.json` with source, runtime use, owner and license.
