import { z } from 'zod';

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

export const galleyFireDefinitionSchema = z.object({
  id: z.literal('fire-galley'),
  name: z.string().min(1),
  position: pointSchema,
  radius: z.number().positive().max(3),
  initialIntensity: z.number().min(0.1).max(1),
});

export const galleyFireDefinition = {
  id: 'fire-galley',
  name: 'Galley fire',
  position: { x: 8, y: 39 },
  radius: 1.35,
  initialIntensity: 0.82,
} as const;

export type GalleyFireDefinition = z.infer<typeof galleyFireDefinitionSchema>;

export const galleyRepairDefinitionSchema = z.object({
  id: z.literal('repair-galley-breaker'),
  name: z.string().min(1),
  position: pointSchema,
  radius: z.number().positive().max(3),
  repairDuration: z.number().positive().max(12),
  triggerAfterCruiseSeconds: z.number().min(0).max(180),
  pressureInterval: z.number().positive().max(30),
  pressureStep: z.number().positive().max(1),
});

export const galleyRepairDefinition = {
  id: 'repair-galley-breaker',
  name: 'Coffee machine mutiny',
  position: { x: 3.4, y: 33 },
  radius: 1.15,
  repairDuration: 3,
  triggerAfterCruiseSeconds: 18,
  pressureInterval: 5,
  pressureStep: 0.12,
} as const;

export type GalleyRepairDefinition = z.infer<typeof galleyRepairDefinitionSchema>;

const navigationObstacleSchema = z.object({
  id: z.literal('north-shoal-contact'),
  name: z.string().min(1),
  kind: z.enum(['drifting-container', 'reef', 'derelict', 'vessel']),
  startPosition: pointSchema,
  relativeVelocity: pointSchema,
  radius: z.number().positive().max(12),
  contactDistance: z.number().positive().max(12),
});

const navigationBridgeSchema = z.object({
  compartmentId: z.literal('bridge'),
  position: pointSchema,
  radius: z.number().positive().max(4),
  lateralRate: z.number().positive().max(30),
  avoidanceMargin: z.number().positive().max(12),
});

export const navigationIncidentDefinitionSchema = z.object({
  id: z.literal('collision-course-reef'),
  name: z.string().min(1),
  warningSeconds: z.number().positive().max(60),
  triggerAfterCruiseSeconds: z.number().min(0).max(180),
  avoidScore: z.number().int().min(0).max(500),
  impactScore: z.number().int().min(-500).max(0),
  repairScore: z.number().int().min(0).max(500),
  damageSystem: z.literal('hydraulics'),
  obstacle: navigationObstacleSchema,
  bridge: navigationBridgeSchema,
});

export const navigationIncidentDefinition = {
  id: 'collision-course-reef',
  name: 'North Shoal collision course',
  // Production travel window: the authored route from the atrium to the
  // bridge needs time for a player to leave a job and take the helm.
  warningSeconds: 36,
  triggerAfterCruiseSeconds: 8,
  avoidScore: 35,
  impactScore: -120,
  repairScore: 90,
  damageSystem: 'hydraulics',
  obstacle: {
    id: 'north-shoal-contact',
    name: 'Unlit workboat contact',
    kind: 'vessel',
    startPosition: { x: 0, y: 58 },
    relativeVelocity: { x: 0, y: -18 },
    radius: 4,
    contactDistance: 4,
  },
  bridge: {
    compartmentId: 'bridge',
    position: { x: 13, y: 5.5 },
    radius: 2.1,
    lateralRate: 10,
    avoidanceMargin: 3.2,
  },
} as const;

export type NavigationIncidentDefinition = z.infer<typeof navigationIncidentDefinitionSchema>;

export const steeringRepairDefinitionSchema = z.object({
  id: z.literal('repair-steering-relay'),
  name: z.string().min(1),
  compartmentId: z.literal('engine-room'),
  position: pointSchema,
  radius: z.number().positive().max(3),
  repairDuration: z.number().positive().max(12),
  pressureInterval: z.number().positive().max(30),
  pressureStep: z.number().positive().max(1),
});

export const steeringRepairDefinition = {
  id: 'repair-steering-relay',
  name: 'Steering relay damage',
  compartmentId: 'engine-room',
  position: { x: 13, y: 22 },
  radius: 1.25,
  repairDuration: 2.5,
  pressureInterval: 4,
  pressureStep: 0.16,
} as const;

export type SteeringRepairDefinition = z.infer<typeof steeringRepairDefinitionSchema>;
