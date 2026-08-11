# Ambient cruise crowd slice

> **Current status (2026-08-10):** The source/presenter contract is implemented,
> but normal packaged NPC visibility is unresolved. See
> [CURRENT_STATUS.md](CURRENT_STATUS.md); the roadmap is in
> [ROADMAP.md](ROADMAP.md).

The host owns 78 deterministic ambient residents across the occupied ship
compartments. Guests receive the same snapshot; activity, route, and
evacuation state never come from the renderer.

`createAmbientCrowdState` creates 78 residents across 8 zones and
`CabinWorld` calls `AmbientCrowdPresenter.sync`. Instances wait for async
`loadRig(characterRigId)`; a load catch only sets `data-character-rig=fallback`
and does not expose a visible error. Residency and 96 m culling, the 24-instance
cap, and fades can leave no visible NPCs in a packaged scene. The focused
`showCrowd()` E2E teleport to `pool-deck` is not normal-start proof.

## GLB presentation

Visible residents use the validated `CM_PASSENGER` GLB mesh and authored
AnimationMixer clips. Per-resident variation is limited to deterministic
material palettes and bounded silhouette scale. The presenter never adds
procedural hair, sunglasses, visors, earbuds, or any other primitive under an
unknown GLB head or bone.

Standing and seated roots start at the compartment floor. On instantiate and
clip changes, the presenter samples the mixer, measures posed mesh bounds in the
root parent's coordinate space, and applies one bounded correction so the
non-swimmer minimum Y meets the intended floor. The correction is recomputed
from the current bounds rather than accumulated; rigs with invalid, extreme, or
post-correction contact error above 0.03 m stay hidden. Swimming residents
remain explicitly submerged and are excluded from contact and floating metrics.

The canvas exposes:

- `data-crowd-floating-count` — non-swimmers whose measured contact error is
  greater than 0.03 m;
- `data-crowd-contact-max` — maximum measured non-swimmer contact error;
- `data-crowd-visible`, `data-crowd-residents`, and
  `data-crowd-evacuating` for deterministic runtime evidence.

The intended acceptance state is zero floating non-swimmers and contact max
at or below 0.03 m. The presenter owns disposal of cloned rigs and cloned
materials.

Service-mission passengers are a separate authored set. Their stable service
definition order selects the six GLB-backed archetypes without hash collapse,
and each rig receives a deterministic mixer phase once at creation. Calm
seated passengers use the authored `seat_idle`, `seat_chat`, `seat_look`, and
`seat_relaxed` loops; semantic reaction states continue to select their
standing, panic, injury, and turbulence clips. The regenerated GLB keeps the
seated lower-body base pose anatomically valid: thighs travel forward from the
hips, shins travel down from the knees, and feet remain near the deck.

## Evidence

`tests/unit/ambient-crowd-presenter.test.ts` covers authored clips, stable
archetypes, seated floor metadata, no procedural attachments, and grounded
standing/seated GLB instances with swimming excluded.
`tests/unit/ambient-npc-style.test.ts` verifies that style application only
recolors/scales the supplied GLB hierarchy. The ambient Playwright test writes
`test-results/correction-evidence/grounded-crowd.png` and asserts floating count
zero plus contact max at or below 0.03 m.
