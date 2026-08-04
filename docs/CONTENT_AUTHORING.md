# Content Authoring

All authored content is validated data in `src/data/`, separate from mutable
runtime state in `src/sim/`. Every definition needs a stable ID, a display name,
authored limits and explicit resolution and cleanup behaviour. Validation must
reject duplicate IDs, positions outside their compartment, missing references
and anything with no resolution path.

Existing files: base object definitions in `src/data/phase-one.ts`, guests,
requests and service props in `src/data/service.ts`, hazard sites in
`src/data/emergencies.ts`. New content gets its own focused file.

## Compartments

One compartment is one entry in `src/data/compartments.ts`, one Blender build
script under `tools/blender/compartments/`, one GLB in `public/assets/`, one
manifest entry, and one node in the portal graph.

A compartment definition records its stable ID, deck, display name, bounds,
portal list, interaction volumes, job sites, hazard sites and spawn points. It
must match the deck tables in [`SHIP_LAYOUT.md`](SHIP_LAYOUT.md); the doc and the
data are validated against each other.

The GLB must expose a root node `CM_<COMPARTMENT>_ROOT` and one named empty
`CM_PORTAL_<TARGET>` per portal, so streaming binds the graph without hard-coded
coordinates. Portals are symmetric: if A declares a portal to B, B declares one
back, and validation rejects a one-way pair.

Compartments are assembled from the shared modular kit on its fixed grid, using
the object naming and classification standards in [`assets.md`](assets.md)
(`ENV_`, `PROP_`, `INT_`, `SYS_`, `LOD1_`). Bespoke geometry is for the few
spaces that earn it.

Build scripts are deterministic and repeatable from source with no manual GUI
steps, following the pattern proven by `build_cabin_scenario.py`. Every
compartment must meet its budget in [`PERFORMANCE.md`](PERFORMANCE.md) before it
can ship: shared material palette, instanced repeats, geometry joined per
material at author time.

## Jobs

A job definition records its stable ID, the job type, which compartments it can
occur in, the required item or tool, the schedule or trigger, the time cost, the
reputation and score consequence for completing or ignoring it, and its cleanup.

A job may be a single action or an ordered chain of steps in different
compartments — cut power, drain coolant, open the casing, replace the part, close
it, restore coolant, restart, verify. Each step records its own compartment,
tool, duration and failure behaviour, and the chain records whether steps must be
done in order and whether a partial chain decays. Multi-step jobs are what make
one crew member unavailable long enough for something else to go wrong, so their
step count is a difficulty knob, not decoration.

Stock outlets record their compartment, the item types they hold, initial stock,
capacity and the source they restock from. An outlet at zero must have a defined
consequence; "nothing happens" is not one.

## Incidents

An incident definition records its stable ID, the trigger (clock, escalation or
debug), the warning it raises, the warning lead time, the response required, the
tool and range needed, the consequence for a successful response and the
consequence for failure — including which other incident it escalates into.

Escalation chains are authored explicitly. A chain with no terminating state is
a validation error.

## Obstacles

An obstacle definition records its stable ID, type, size, spawn bearing range,
spawn distance, the clearance margin the ship's track must achieve, the speed
penalty for a successful dodge, and the hull damage for a miss.

The warning lead time must be at least the authored time for a player to walk
from the farthest compartment to the bridge, at base propulsion, with no
upgrades. If it is not, the incident is unwinnable and validation should say so.

## Upgrades

An upgrade definition records its stable ID, line, tier, cost, prerequisite and
the authored numbers it modifies.

**An upgrade may only change a value an existing system already reads.** An
upgrade that requires new behaviour is a new slice, not an upgrade, and belongs
in the roadmap instead.

## Assets

Use only project-owned, licensed or generated assets. Tracked Blender sources
and generated GLBs are catalogued in [`assets.md`](assets.md); register every
shipped file asset in `public/assets/manifest.json` with source, runtime use,
owner and licence.

Do not treat a visual GLB as authoritative for interaction or collision. Those
contracts live in validated data and host simulation rules, and every
compartment must remain playable as greybox if its GLB fails to load.
