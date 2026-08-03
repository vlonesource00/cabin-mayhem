# Contributing

## Branches

- `main`: stable, tested builds only.
- `develop`: integrated work.
- `feature/<system>`, `fix/<issue>`, `refactor/<area>`, `test/<area>`, `docs/<topic>`: isolated work.

Do not develop substantial work directly on `main` or `develop`.

## Before a pull request

1. Run relevant tests, `pnpm validate:data`, `pnpm validate:assets` and `pnpm build`.
2. Review diff; keep generated builds, secrets, caches and captures unstaged.
3. Update docs when behavior changes.
4. State change, reason, test steps, limits, network/performance/save implications and screenshots for visible work.

For asset changes, update `docs/assets.md` and `public/assets/manifest.json`. A Blender source change must regenerate and validate the corresponding runtime GLB. For room changes, document whether the check is deterministic local transport or a real `LIVE_MULTIPLAYER=1` cloud smoke; never commit TURN credentials.

Use Conventional Commits: `feat:`, `fix:`, `test:`, `refactor:` or `docs:`.

## Phase 1 invariant

Host simulation owns flight phase, object reservation, object physics, subsystem damage and debug actions. Clients send intentions only. Do not make a critical path client-authoritative.
