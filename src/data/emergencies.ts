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
