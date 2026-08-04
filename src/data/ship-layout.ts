import { z } from 'zod';

/**
 * The authored compartment graph, and the only place compartment geometry,
 * placement and connectivity are declared.
 *
 * Geometry is presentation. Nothing here is derived from a GLB, and a missing
 * GLB changes nothing in this file: the streamer builds greybox from these same
 * numbers and the voyage continues. See `docs/SHIP_LAYOUT.md`.
 */

const vec3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

export const portalSchema = z.object({
  /** The compartment on the other side. Must resolve, and must be symmetric. */
  target: z.string().regex(/^[a-z0-9-]+$/),
  /** Compartment-local position of the doorway centre, in metres. */
  position: vec3Schema,
});

export const compartmentSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  /** Numbered playable deck, 0 (machinery) through 5 (exterior). */
  deck: z.number().int().min(0).max(5),
  /** Interior clear extent in metres: width, height, length. */
  size: vec3Schema,
  /**
   * Where the compartment's floor centre sits in ship space. The hull never
   * translates, so these are fixed for the life of the ship: the streamer
   * offsets every resident compartment by its delta from the occupied one.
   */
  anchor: vec3Schema,
  portals: z.array(portalSchema).min(1),
  /** Per-compartment ceiling from docs/PERFORMANCE.md. */
  budget: z.object({
    maxDrawMeshes: z.number().int().positive().max(40),
    maxBytes: z.number().int().positive().max(3_145_728),
  }),
});

export const shipLayoutSchema = z.object({
  id: z.literal('ms-cabin-mayhem'),
  /** Deck-to-deck pitch in metres, fixed by docs/SHIP_LAYOUT.md. */
  deckPitch: z.literal(3.2),
  compartments: z.array(compartmentSchema).min(4),
});

export type PortalDefinition = z.infer<typeof portalSchema>;
export type CompartmentDefinition = z.infer<typeof compartmentSchema>;
export type ShipLayout = z.infer<typeof shipLayoutSchema>;

const budget = { maxDrawMeshes: 40, maxBytes: 3_145_728 };

export const shipLayout = {
  id: 'ms-cabin-mayhem',
  deckPitch: 3.2,
  compartments: [
    {
      id: 'atrium',
      label: 'Atrium',
      deck: 2,
      // The atrium footprint is deliberately the simulation's cabin volume:
      // 16 x 36 authored units at CABIN_SCALE 0.5 is 8 m x 18 m. Guests keep
      // their seats and loose props keep their floor when the shell changes.
      size: { x: 8, y: 6.4, z: 18 },
      anchor: { x: 0, y: 6.4, z: 0 },
      portals: [
        { target: 'cabin-corridor-a', position: { x: 0, y: 0, z: -9 } },
        { target: 'bridge', position: { x: 0, y: 0, z: 9 } },
      ],
      budget,
    },
    {
      id: 'cabin-corridor-a',
      label: 'Cabin corridor A',
      deck: 1,
      size: { x: 3, y: 2.8, z: 24 },
      anchor: { x: 0, y: 3.2, z: -30 },
      portals: [
        { target: 'atrium', position: { x: 0, y: 0, z: 12 } },
        { target: 'engine-room', position: { x: 0, y: 0, z: -12 } },
      ],
      budget,
    },
    {
      id: 'bridge',
      label: 'Bridge',
      deck: 4,
      size: { x: 14, y: 3, z: 7 },
      anchor: { x: 0, y: 12.8, z: 96 },
      portals: [{ target: 'atrium', position: { x: 0, y: 0, z: -3.5 } }],
      budget,
    },
    {
      id: 'engine-room',
      label: 'Engine room',
      deck: 0,
      size: { x: 14, y: 7, z: 18 },
      anchor: { x: 0, y: 0, z: -74 },
      portals: [{ target: 'cabin-corridor-a', position: { x: 0, y: 0, z: 9 } }],
      budget,
    },
  ],
} as const satisfies ShipLayout;

/** The compartment the crew wakes up in. */
export const defaultCompartmentId = 'atrium';

export function compartmentById(id: string): CompartmentDefinition | undefined {
  return shipLayout.compartments.find((compartment) => compartment.id === id);
}

/**
 * Breadth-first portal distance from `origin`. Doors, not metres: the streaming
 * residency rule in docs/SHIP_LAYOUT.md is expressed in portal hops because a
 * closed door culls a compartment regardless of how near it is.
 */
export function portalDistances(origin: string): Map<string, number> {
  const distances = new Map<string, number>();
  if (!compartmentById(origin)) return distances;
  distances.set(origin, 0);
  const queue: string[] = [origin];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const depth = distances.get(current) as number;
    for (const portal of compartmentById(current)?.portals ?? []) {
      if (distances.has(portal.target)) continue;
      if (!compartmentById(portal.target)) continue;
      distances.set(portal.target, depth + 1);
      queue.push(portal.target);
    }
  }
  return distances;
}

export type ResidencyDetail = 'full' | 'reduced';

/**
 * The resident set for an occupied compartment: itself and its direct
 * neighbours at full detail, two hops away reduced, nothing beyond.
 */
export function residency(origin: string): Map<string, ResidencyDetail> {
  const resident = new Map<string, ResidencyDetail>();
  for (const [id, hops] of portalDistances(origin)) {
    if (hops <= 1) resident.set(id, 'full');
    else if (hops === 2) resident.set(id, 'reduced');
  }
  return resident;
}
