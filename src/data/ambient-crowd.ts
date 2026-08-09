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
