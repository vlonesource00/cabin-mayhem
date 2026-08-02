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
  position: { x: 10.8, y: 23.6 },
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
  position: { x: 5.25, y: 25.6 },
  radius: 1.15,
  repairDuration: 3,
  triggerAfterCruiseSeconds: 18,
  pressureInterval: 5,
  pressureStep: 0.12,
} as const;

export type GalleyRepairDefinition = z.infer<typeof galleyRepairDefinitionSchema>;
