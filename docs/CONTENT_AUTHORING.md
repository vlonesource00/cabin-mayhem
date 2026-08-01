# Content Authoring

Phase 1 object definitions live in validated `src/data/phase-one.ts`. Before Phase 2 content growth, add static passenger, cargo, event, route, weather and upgrade definitions to `src/data/` files.

Every definition needs stable ID, display name, authored limits and explicit resolution/cleanup behavior. Validation must reject duplicate IDs, missing references, invalid event dependencies, circular upgrade prerequisites, impossible cargo dimensions, invalid seats and events with no resolution path.

Use only project-owned, licensed or generated assets. Register every file asset in `public/assets/manifest.json` with source, runtime use, owner and license.
