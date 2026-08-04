# ADR 0002 — The camera stays first person

**Status:** Accepted
**Supersedes:** nothing
**Related:** [ADR 0001](0001-cruise-ship-pivot.md)

## Context

The cruise pivot raised the question of whether a cooperative game about a crew
running one ship should let you see your crewmates — that is, whether to move to
a third-person camera. It was recorded as an open decision blocking Phase 6,
because interiors get authored around a camera height and the choice cannot be
made cheaply after rooms exist.

## Decision

**First person.** No third-person camera.

## Consequences

What this keeps, at no cost:

- `FirstPersonController` and pointer-lock capture stay as they are.
- The authored seven-bone first-person arms rig `CM_FPARMS_ROOT` and its
  nineteen clips stay in service, along with the `data-arms-rig` fallback seam
  that Playwright asserts on.
- Interaction stays a camera-forward raycast. The client picks a candidate and
  the host validates ownership, tool, target and range — unchanged.
- The local player is never a full skinned character in the render budget, which
  keeps a whole tier out of the character LOD accounting in
  [`PERFORMANCE.md`](../PERFORMANCE.md).
- Compartment authoring can proceed against a fixed eye height immediately.

What it costs:

- You cannot see your own body, and you see crewmates only when they are in
  front of you. Crew presence has to be carried by other channels: audio,
  the HUD, and remote players' full humanoid rig being visible and readable at
  distance.
- Blind spots are real in a game about physical comedy. Some jokes land behind
  you and are only heard.

Mitigation: remote players still use the shared nineteen-bone `CM_HUMANOID` rig
with its twenty-five clips, so what you see of other people is expressive even
though you never see yourself.

## Alternatives rejected

**Third person.** Retires `CM_FPARMS_ROOT` and its nineteen authored clips,
changes interaction raycasting from camera-forward to character-relative, and
adds the local player to every LOD budget. The benefit — seeing your crewmates —
is real but does not pay for discarding shipped, tested, authored work.

**Selectable camera.** Both, at the cost of maintaining both, including two
interaction models and two sets of animation assumptions. Rejected as the most
expensive option available.
