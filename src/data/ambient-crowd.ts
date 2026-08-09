import { z } from 'zod';

export const ambientActivitySchema = z.enum([
  'strolling',
  'chatting',
  'dining',
  'cooking',
  'housekeeping',
  'sightseeing',
  'photography',
  'swimming',
  'sunbathing',
  'evacuating',
]);

export type AmbientActivity = z.infer<typeof ambientActivitySchema>;

const zoneSchema = z.object({
  compartmentId: z.enum([
    'atrium',
    'main-galley',
    'dining-room',
    'cabin-deck-four',
    'promenade',
    'cabin-deck-seven',
    'pool-deck',
    'sun-deck',
  ]),
  count: z.number().int().positive().max(16),
  width: z.number().positive(),
  length: z.number().positive(),
  activities: z.array(ambientActivitySchema.exclude(['evacuating'])).min(1),
});

export const ambientCrowdZones = z
  .array(zoneSchema)
  .min(1)
  .parse([
    {
      compartmentId: 'atrium',
      count: 10,
      width: 24,
      length: 46,
      activities: ['strolling', 'chatting', 'sightseeing'],
    },
    {
      compartmentId: 'main-galley',
      count: 8,
      width: 24,
      length: 32,
      activities: ['cooking', 'strolling'],
    },
    {
      compartmentId: 'dining-room',
      count: 10,
      width: 28,
      length: 44,
      activities: ['dining', 'chatting', 'strolling'],
    },
    {
      compartmentId: 'cabin-deck-four',
      count: 8,
      width: 34,
      length: 60,
      activities: ['housekeeping', 'strolling'],
    },
    {
      compartmentId: 'promenade',
      count: 12,
      width: 38,
      length: 260,
      activities: ['strolling', 'sightseeing', 'photography'],
    },
    {
      compartmentId: 'cabin-deck-seven',
      count: 8,
      width: 30,
      length: 29,
      activities: ['housekeeping', 'strolling'],
    },
    {
      compartmentId: 'pool-deck',
      count: 12,
      width: 34,
      length: 119,
      activities: ['swimming', 'sunbathing', 'strolling', 'chatting'],
    },
    {
      compartmentId: 'sun-deck',
      count: 10,
      width: 30,
      length: 74,
      activities: ['sunbathing', 'sightseeing', 'photography', 'strolling'],
    },
  ]);

export const ambientResidentCount = ambientCrowdZones.reduce((sum, zone) => sum + zone.count, 0);

export const ambientNames = [
  'Ada',
  'Bea',
  'Cleo',
  'Dani',
  'Eli',
  'Faye',
  'Gus',
  'Hana',
  'Ivo',
  'Jules',
  'Kai',
  'Luz',
  'Mina',
  'Nico',
  'Ola',
  'Pia',
] as const;

export const ambientColors = [
  '#43c6ac',
  '#ff8a5b',
  '#6c8cff',
  '#f4c95d',
  '#da70d6',
  '#76d7ea',
  '#ef767a',
  '#8bd450',
] as const;

const ambientHexColor = z.string().regex(/^#[0-9a-f]{6}$/i);

/**
 * Presentation-only passenger looks. These stay data-driven so every client
 * can derive the same look from the host-owned guest id without adding fields
 * to the authoritative crowd snapshot or adding another GLB.
 */
export const ambientArchetypeSchema = z.object({
  id: z.enum([
    'harbor-cap',
    'sunset-bob',
    'seafoam-bun',
    'violet-crop',
    'canary-visor',
    'coral-earbuds',
  ]),
  silhouette: z.object({
    width: z.number().min(0.88).max(1.12),
    height: z.number().min(0.92).max(1.1),
    depth: z.number().min(0.9).max(1.1),
  }),
  palette: z.object({
    skin: ambientHexColor,
    shirt: ambientHexColor,
    trousers: ambientHexColor,
    hair: ambientHexColor,
    accessory: ambientHexColor,
  }),
  hair: z.enum(['crop', 'bob', 'bun', 'cap']),
  accessory: z.enum(['none', 'sunglasses', 'visor', 'earbuds']),
  finish: z.object({
    roughness: z.number().min(0.35).max(0.9),
    metalness: z.number().min(0).max(0.2),
  }),
  /** Measured against the shipped CM_PASSENGER seated clips. */
  seat: z.object({
    surfaceHeight: z.number().min(-1).max(1),
    footContactHeight: z.number().positive().max(1),
    pelvisDrop: z.number().positive().max(1),
    yawOffset: z.number().min(-0.35).max(0.35),
  }),
});

export type AmbientArchetype = z.infer<typeof ambientArchetypeSchema>;

export const ambientArchetypes = z
  .array(ambientArchetypeSchema)
  .length(6)
  .parse([
    {
      id: 'harbor-cap',
      silhouette: { width: 0.94, height: 1.06, depth: 0.96 },
      palette: {
        skin: '#b8795f',
        shirt: '#2b8f9b',
        trousers: '#29334e',
        hair: '#28303b',
        accessory: '#f3c34f',
      },
      hair: 'cap',
      accessory: 'none',
      finish: { roughness: 0.62, metalness: 0.02 },
      seat: { surfaceHeight: 0.015, footContactHeight: 0.357, pelvisDrop: 0.42, yawOffset: -0.1 },
    },
    {
      id: 'sunset-bob',
      silhouette: { width: 1.04, height: 0.98, depth: 1.02 },
      palette: {
        skin: '#d28e70',
        shirt: '#f07862',
        trousers: '#493c59',
        hair: '#6a2e3d',
        accessory: '#f8d77a',
      },
      hair: 'bob',
      accessory: 'sunglasses',
      finish: { roughness: 0.7, metalness: 0.01 },
      seat: { surfaceHeight: 0.015, footContactHeight: 0.357, pelvisDrop: 0.42, yawOffset: 0.08 },
    },
    {
      id: 'seafoam-bun',
      silhouette: { width: 1.08, height: 1.02, depth: 1.06 },
      palette: {
        skin: '#8f5e4d',
        shirt: '#64c6a5',
        trousers: '#254f58',
        hair: '#30251f',
        accessory: '#e3f4ef',
      },
      hair: 'bun',
      accessory: 'earbuds',
      finish: { roughness: 0.56, metalness: 0.04 },
      seat: { surfaceHeight: 0.015, footContactHeight: 0.357, pelvisDrop: 0.42, yawOffset: -0.06 },
    },
    {
      id: 'violet-crop',
      silhouette: { width: 0.96, height: 1.01, depth: 0.94 },
      palette: {
        skin: '#e0ad83',
        shirt: '#7652b8',
        trousers: '#26243e',
        hair: '#39284f',
        accessory: '#e9a9e7',
      },
      hair: 'crop',
      accessory: 'visor',
      finish: { roughness: 0.64, metalness: 0.03 },
      seat: { surfaceHeight: 0.015, footContactHeight: 0.357, pelvisDrop: 0.42, yawOffset: 0.12 },
    },
    {
      id: 'canary-visor',
      silhouette: { width: 0.92, height: 1.09, depth: 0.98 },
      palette: {
        skin: '#c58163',
        shirt: '#e2b83f',
        trousers: '#33424f',
        hair: '#1f2b32',
        accessory: '#4ed5e4',
      },
      hair: 'cap',
      accessory: 'visor',
      finish: { roughness: 0.52, metalness: 0.08 },
      seat: { surfaceHeight: 0.015, footContactHeight: 0.357, pelvisDrop: 0.42, yawOffset: -0.04 },
    },
    {
      id: 'coral-earbuds',
      silhouette: { width: 1.02, height: 0.95, depth: 1.08 },
      palette: {
        skin: '#704638',
        shirt: '#e75c78',
        trousers: '#293943',
        hair: '#171d26',
        accessory: '#f4f0d2',
      },
      hair: 'crop',
      accessory: 'earbuds',
      finish: { roughness: 0.76, metalness: 0.01 },
      seat: { surfaceHeight: 0.015, footContactHeight: 0.357, pelvisDrop: 0.42, yawOffset: 0.04 },
    },
  ]);
