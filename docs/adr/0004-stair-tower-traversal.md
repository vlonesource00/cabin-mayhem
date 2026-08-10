# ADR 0004 — Decks connect only through stair towers

**Status:** Accepted
**Supersedes:** the stand-in `atrium ↔ bridge` and `cabin-corridor-a ↔ engine-room` portals
**Related:** [ADR 0003](0003-ship-layout-redesign.md)

## Context

Before the towers existed, the portal graph was wired with whatever pairs kept
the game playable: the atrium opened onto the bridge, a cabin corridor opened
onto the engine room. Those were honest stand-ins — documented as such — but they
had consequences that outlived their honesty.

A door from a guest corridor straight into the engine room means the ship has no
vertical geometry. Nothing is above or below anything; the deck number is a
label. It also means every room is one hop from every other room, which is both
wrong for the fiction and wrong for the streamer, whose whole residency model is
built on hop distance meaning something.

Ten decks made the question urgent: the helm sits nine decks above the engine
room, and that distance is supposed to be the source of most of the game's
tension.

## Decision

**Three stair towers are the only vertical connection in the ship, and no
room-to-room portal ever crosses a deck.**

| Tower           | Decks | Landings |
| --------------- | ----- | -------- |
| `stairwell-aft` | 0–9   | 8        |
| `stairwell-mid` | 1–9   | 6        |
| `stairwell-fwd` | 5–9   | 3        |

A tower is a compartment like any other — one GLB, one budget, one entry in the
graph — but shaped as a hub: eight portals at the same x/z and different y, one
per landing. Every room hangs off at least one tower. The promenade, being the
one continuous walk around the ship, reaches all three.

## Consequences

- **Distance is real.** Getting from the engine room to the bridge is a climb
  through the aft tower and a walk forward, and it costs what it should cost.
  The helm being far from the machinery is now a fact about the ship rather than
  a line in a design document.
- **Hop distance means something again**, so `residency` works as designed:
  one hop full detail, two hops reduced, nothing beyond.
- **Towers are the ship's stress case, and are authored for it.** Standing on a
  landing makes eight rooms one hop away and therefore full-detail residents.
  That is why the towers are the leanest compartments aboard — a tower earns its
  detail from its own stairs, rails and signage, not from dressing that would be
  loaded alongside eight other rooms.
- **The graph is checkable.** `pnpm validate:data` proves symmetry, that both
  sides of a portal resolve to the same ship-space point, and reachability from
  the default compartment. A stair that goes nowhere is a failing test, not a
  thing a player finds.
- Adding a compartment now has an obvious shape: build it on a deck, put a door
  onto the nearest tower, done. No new engine work, no new portal category.

## Alternatives rejected

**Lifts.** More authentic to a modern liner and much worse to play: a timed box
that removes the climb is a loading screen with a door on it. Held in reserve as
a possible late upgrade, where skipping the climb is a reward for having done it.

**Room-to-room vertical portals** (a hatch straight from the galley to the
stores). Cheap to author and it dissolves the deck structure again. If a shortcut
is wanted it should be a deliberate, findable one — not the default topology.

**One central tower.** Simpler graph, and it makes every journey pass through the
same room. Three towers give the ship a fore-and-aft geography and let the
promenade be the horizontal spine that joins them.
