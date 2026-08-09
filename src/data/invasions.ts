import { z } from 'zod';

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

export const boardingEnemyKindSchema = z.enum(['pirate', 'bomber']);
export const boardingDefenseActionKindSchema = z.enum(['detach-boarding-board', 'release-gangway']);
export const invasionAssetIdSchema = z.enum([
  'pirate-boarder-character',
  'saboteur-boarder-character',
  'boarding-pistol',
  'boarding-cutlass',
  'satchel-charge',
  'boarding-board',
  'pirate-gangway',
  'pirate-gear-crate',
]);

const invasionAssetDefinitionSchema = z.object({
  id: invasionAssetIdSchema,
  path: z.string().regex(/^\/assets\/invasions\/[a-z0-9-/]+\.glb$/),
  role: z.enum(['character', 'weapon', 'explosive', 'boarding-link', 'prop']),
  requiredNodes: z.array(z.string().min(1)),
  requiredActions: z.array(z.string().min(1)),
});

const enemyPresentationSchema = z.object({
  kind: boardingEnemyKindSchema,
  characterAssetId: invasionAssetIdSchema,
  loadoutAssetIds: z.array(invasionAssetIdSchema).min(1),
});

const boardingLinkDefinitionSchema = z.object({
  id: z.enum(['port-boarding-board', 'starboard-gangway']),
  name: z.string().min(1),
  kind: z.enum(['boarding-board', 'gangway']),
  compartmentId: z.string().min(1),
  position: pointSchema,
  interactionRadius: z.number().positive().max(4),
  detachAction: boardingDefenseActionKindSchema,
  assetId: invasionAssetIdSchema,
});

export const boardingInvasionDefinitionSchema = z.object({
  id: z.literal('pirate-boarding-alpha'),
  name: z.string().min(1),
  defaultEnemyKind: z.literal('pirate'),
  supportedEnemyKinds: z.array(boardingEnemyKindSchema).min(2),
  triggerAfterCruiseSeconds: z.number().min(0).max(300),
  warningSeconds: z.number().positive().max(60),
  approachSeconds: z.number().positive().max(60),
  maxRaidSeconds: z.number().positive().max(120),
  pressureInterval: z.number().positive().max(30),
  initialHostileCount: z.number().int().positive().max(24),
  passengerCount: z.number().int().positive().max(200),
  passengerFailureThreshold: z.number().int().positive().max(200),
  infrastructureDamagePerPulse: z.number().positive().max(100),
  scorePerPressurePulse: z.number().int().max(0).min(-500),
  detachScore: z.number().int().min(0).max(500),
  resolutionScore: z.number().int().min(0).max(1000),
  failureScore: z.number().int().max(0).min(-1000),
  assets: z.array(invasionAssetDefinitionSchema).min(8),
  enemyPresentations: z.array(enemyPresentationSchema).length(2),
  links: z.array(boardingLinkDefinitionSchema).length(2),
});

export const boardingInvasionDefinition = boardingInvasionDefinitionSchema.parse({
  id: 'pirate-boarding-alpha',
  name: 'Blackwake pirate boarding',
  defaultEnemyKind: 'pirate',
  // "Bomber" means a hostile boarding saboteur character, never an aircraft or boat.
  supportedEnemyKinds: ['pirate', 'bomber'],
  triggerAfterCruiseSeconds: 55,
  warningSeconds: 12,
  approachSeconds: 8,
  maxRaidSeconds: 18,
  pressureInterval: 3,
  initialHostileCount: 6,
  passengerCount: 8,
  passengerFailureThreshold: 3,
  infrastructureDamagePerPulse: 12,
  scorePerPressurePulse: -15,
  detachScore: 25,
  resolutionScore: 120,
  failureScore: -180,
  assets: [
    {
      id: 'pirate-boarder-character',
      path: '/assets/invasions/characters/pirate-boarder.glb',
      role: 'character',
      requiredNodes: ['Armature', 'weapon_socket_r', 'weapon_socket_l'],
      requiredActions: [
        'Idle',
        'Run',
        'Board',
        'Aim',
        'Fire',
        'Melee',
        'HitReact',
        'Fall',
        'Retreat',
      ],
    },
    {
      id: 'saboteur-boarder-character',
      path: '/assets/invasions/characters/saboteur-boarder.glb',
      role: 'character',
      requiredNodes: ['Armature', 'weapon_socket_r', 'explosive_socket'],
      requiredActions: [
        'Idle',
        'Run',
        'Board',
        'Aim',
        'PlantExplosive',
        'ArmExplosive',
        'HitReact',
        'Fall',
        'Retreat',
      ],
    },
    {
      id: 'boarding-pistol',
      path: '/assets/invasions/weapons/boarding-pistol.glb',
      role: 'weapon',
      requiredNodes: ['root', 'grip', 'muzzle'],
      requiredActions: [],
    },
    {
      id: 'boarding-cutlass',
      path: '/assets/invasions/weapons/boarding-cutlass.glb',
      role: 'weapon',
      requiredNodes: ['root', 'grip'],
      requiredActions: [],
    },
    {
      id: 'satchel-charge',
      path: '/assets/invasions/explosives/satchel-charge.glb',
      role: 'explosive',
      requiredNodes: ['root', 'indicator', 'interaction_anchor'],
      requiredActions: ['Idle', 'Arm', 'Disarm', 'Detonate'],
    },
    {
      id: 'boarding-board',
      path: '/assets/invasions/boarding/boarding-board.glb',
      role: 'boarding-link',
      requiredNodes: ['root', 'ship_attach', 'raider_attach', 'interaction_anchor'],
      requiredActions: ['Approach', 'Attach', 'Detach', 'Detached'],
    },
    {
      id: 'pirate-gangway',
      path: '/assets/invasions/boarding/pirate-gangway.glb',
      role: 'boarding-link',
      requiredNodes: ['root', 'ship_attach', 'raider_attach', 'interaction_anchor'],
      requiredActions: ['Approach', 'Attach', 'Release', 'Detached'],
    },
    {
      id: 'pirate-gear-crate',
      path: '/assets/invasions/props/pirate-gear-crate.glb',
      role: 'prop',
      requiredNodes: ['root', 'interaction_anchor'],
      requiredActions: ['Closed', 'Open'],
    },
  ],
  enemyPresentations: [
    {
      kind: 'pirate',
      characterAssetId: 'pirate-boarder-character',
      loadoutAssetIds: ['boarding-pistol', 'boarding-cutlass', 'pirate-gear-crate'],
    },
    {
      kind: 'bomber',
      characterAssetId: 'saboteur-boarder-character',
      loadoutAssetIds: ['boarding-pistol', 'satchel-charge'],
    },
  ],
  links: [
    {
      id: 'port-boarding-board',
      name: 'Port boarding board',
      kind: 'boarding-board',
      compartmentId: 'promenade',
      position: { x: 3.5, y: 130 },
      interactionRadius: 2.25,
      detachAction: 'detach-boarding-board',
      assetId: 'boarding-board',
    },
    {
      id: 'starboard-gangway',
      name: 'Starboard pirate gangway',
      kind: 'gangway',
      compartmentId: 'promenade',
      position: { x: 34.5, y: 130 },
      interactionRadius: 2.25,
      detachAction: 'release-gangway',
      assetId: 'pirate-gangway',
    },
  ],
});

export type BoardingInvasionDefinition = z.infer<typeof boardingInvasionDefinitionSchema>;
export type BoardingEnemyKind = z.infer<typeof boardingEnemyKindSchema>;
export type BoardingDefenseActionKind = z.infer<typeof boardingDefenseActionKindSchema>;
export type InvasionAssetId = z.infer<typeof invasionAssetIdSchema>;
