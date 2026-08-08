# Contributing

## Branches

- `novo-main-stable`: the project base. Stable, tested builds only; GitHub Pages deploys from it.
- `feature/<system>`, `fix/<issue>`, `refactor/<area>`, `test/<area>`, `docs/<topic>`: isolated work.

`novo-main-stable` is protected: direct pushes are rejected, every change lands through a pull request with the `verify` check green and one approval, and force-pushes and deletion are blocked. Admins are not exempt. Branch from it, merge back into it.

A long-lived `develop` integration branch has been proposed. It is not adopted: with two collaborators and one protected base, it adds a merge hop without adding safety. Revisit if the team grows.

**Git LFS is an open decision.** Blender sources, textures, audio and compartment GLBs are binary and will grow fast; LFS is the normal answer. It is not enabled yet because migrating existing tracked binaries rewrites history on a protected branch, and both collaborators have to install LFS on the same day or clones silently break. Decide before Phase 6 starts producing one GLB per compartment.

Two collaborators cannot approve their own pull requests, so a change needs the other person's review. Prefer non-overlapping slices — Git cannot merge binary `.blend` files, and whoever loses that conflict redoes the work.

## Before a pull request

1. Run relevant tests, `pnpm validate:data`, `pnpm validate:assets` and `pnpm build`.
2. Review diff; keep generated builds, secrets, caches and captures unstaged.
3. Update docs when behavior changes.
4. State change, reason, test steps, limits, network/performance/save implications and screenshots for visible work.

For asset changes, update `docs/assets.md` and `public/assets/manifest.json`. A Blender source change must regenerate and validate the corresponding runtime GLB. For room changes, document whether the check is deterministic local transport or a real `LIVE_MULTIPLAYER=1` cloud smoke; never commit TURN credentials.

Use Conventional Commits: `feat:`, `fix:`, `test:`, `refactor:` or `docs:`.

## Invariants

Host simulation owns voyage phase, ship state, object reservation, object physics, subsystem damage, hazard resolution, obstacle avoidance and debug actions. Clients send intentions only. Do not make a critical path client-authoritative.

Presentation is never authoritative. A missing or broken GLB degrades to greybox and the voyage continues; animation never decides whether a dodge, repair, delivery, suppression or hit succeeds.

New content must meet its budget in [docs/PERFORMANCE.md](docs/PERFORMANCE.md). A compartment that breaks the frame or draw-call budget does not merge, however good it looks.
