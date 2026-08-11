import { z } from 'zod';

export const weaponIdSchema = z.enum([
  'defense-sidearm',
  'deck-pump-shotgun',
  'compact-boarder-smg',
  'maritime-flare-gun',
]);

export const weaponActionNameSchema = z.enum(['Idle', 'Fire', 'Reload', 'Inspect']);

export const weaponSocketSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  role: z.string().min(1),
});

export const weaponActionSchema = z.object({
  name: weaponActionNameSchema,
  durationSeconds: z.number().positive().max(5),
  loop: z.boolean(),
});

export const weaponBudgetSchema = z
  .object({
    minBytes: z.number().int().positive(),
    maxBytes: z.number().int().positive(),
    minTriangles: z.number().int().positive(),
    maxTriangles: z.number().int().positive(),
    minMeshes: z.number().int().positive(),
    maxMeshes: z.number().int().positive(),
    minMaterials: z.number().int().positive(),
    maxMaterials: z.number().int().positive(),
    maxNodes: z.number().int().positive(),
  })
  .superRefine((budget, ctx) => {
    const pairs = [
      ['bytes', budget.minBytes, budget.maxBytes],
      ['triangles', budget.minTriangles, budget.maxTriangles],
      ['meshes', budget.minMeshes, budget.maxMeshes],
      ['materials', budget.minMaterials, budget.maxMaterials],
    ] as const;
    for (const [label, minimum, maximum] of pairs) {
      if (minimum >= maximum)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} minimum must be less than maximum`,
        });
    }
  });

export const weaponAssetSchema = z
  .object({
    id: weaponIdSchema,
    displayName: z.string().min(1),
    silhouette: z.enum(['sidearm', 'pump-shotgun', 'compact-smg', 'flare-gun']),
    path: z.string().regex(/^\/assets\/weapons\/[a-z0-9-]+\.glb$/),
    sourceFile: z.literal('assets-src/blender/weapons.blend'),
    sockets: z.array(weaponSocketSchema).min(4),
    actions: z.array(weaponActionSchema).length(4),
    budget: weaponBudgetSchema,
  })
  .superRefine((asset, ctx) => {
    const socketNames = asset.sockets.map((socket) => socket.name);
    if (new Set(socketNames).size !== socketNames.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${asset.id} socket names must be unique`,
      });
    if (!socketNames.includes('root'))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${asset.id} must expose root socket` });

    const actionNames = asset.actions.map((action) => action.name);
    if (new Set(actionNames).size !== actionNames.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${asset.id} action names must be unique`,
      });
    for (const action of asset.actions) {
      if (action.name === 'Idle' && !action.loop)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${asset.id} Idle action must loop` });
      if (action.name !== 'Idle' && action.loop)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${asset.id} ${action.name} action must be one-shot`,
        });
    }
  });

export const weaponArsenalManifestSchema = z
  .object({
    version: z.literal(1),
    sourceFile: z.literal('assets-src/blender/weapons.blend'),
    assets: z.array(weaponAssetSchema).length(4),
  })
  .superRefine((manifest, ctx) => {
    const ids = manifest.assets.map((asset) => asset.id);
    const paths = manifest.assets.map((asset) => asset.path);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Weapon asset IDs must be unique' });
    if (new Set(paths).size !== paths.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Weapon runtime paths must be unique' });
  });

const commonActions = [
  { name: 'Idle', durationSeconds: 1.2, loop: true },
  { name: 'Fire', durationSeconds: 0.5667, loop: false },
  { name: 'Reload', durationSeconds: 1.3667, loop: false },
  { name: 'Inspect', durationSeconds: 1.8, loop: false },
] as const;

const commonBudget = {
  minBytes: 75_000,
  maxBytes: 250_000,
  minTriangles: 1_000,
  maxTriangles: 8_000,
  minMeshes: 16,
  maxMeshes: 48,
  minMaterials: 6,
  maxMaterials: 12,
  maxNodes: 96,
} as const;

export const weaponArsenalManifest = weaponArsenalManifestSchema.parse({
  version: 1,
  sourceFile: 'assets-src/blender/weapons.blend',
  assets: [
    {
      id: 'defense-sidearm',
      displayName: 'Defence Sidearm',
      silhouette: 'sidearm',
      path: '/assets/weapons/defense-sidearm.glb',
      sourceFile: 'assets-src/blender/weapons.blend',
      sockets: [
        { name: 'root', role: 'asset_root' },
        { name: 'grip', role: 'hand_attach' },
        { name: 'muzzle', role: 'projectile_origin' },
        { name: 'magazine', role: 'magazine_attach' },
        { name: 'sight', role: 'aim_reference' },
        { name: 'ejection_port', role: 'spent_case_origin' },
      ],
      actions: commonActions,
      budget: commonBudget,
    },
    {
      id: 'deck-pump-shotgun',
      displayName: 'Deck Pump Shotgun',
      silhouette: 'pump-shotgun',
      path: '/assets/weapons/deck-pump-shotgun.glb',
      sourceFile: 'assets-src/blender/weapons.blend',
      sockets: [
        { name: 'root', role: 'asset_root' },
        { name: 'grip', role: 'hand_attach' },
        { name: 'muzzle', role: 'projectile_origin' },
        { name: 'stock', role: 'shoulder_attach' },
        { name: 'pump', role: 'pump_hand_attach' },
        { name: 'shell_port', role: 'shell_feed' },
        { name: 'sight', role: 'aim_reference' },
      ],
      actions: commonActions,
      budget: commonBudget,
    },
    {
      id: 'compact-boarder-smg',
      displayName: 'Compact Boarder SMG',
      silhouette: 'compact-smg',
      path: '/assets/weapons/compact-boarder-smg.glb',
      sourceFile: 'assets-src/blender/weapons.blend',
      sockets: [
        { name: 'root', role: 'asset_root' },
        { name: 'grip', role: 'hand_attach' },
        { name: 'muzzle', role: 'projectile_origin' },
        { name: 'stock', role: 'shoulder_attach' },
        { name: 'magazine', role: 'magazine_attach' },
        { name: 'sight', role: 'aim_reference' },
        { name: 'bolt', role: 'bolt_handle' },
      ],
      actions: commonActions,
      budget: commonBudget,
    },
    {
      id: 'maritime-flare-gun',
      displayName: 'Maritime Flare Gun',
      silhouette: 'flare-gun',
      path: '/assets/weapons/maritime-flare-gun.glb',
      sourceFile: 'assets-src/blender/weapons.blend',
      sockets: [
        { name: 'root', role: 'asset_root' },
        { name: 'grip', role: 'hand_attach' },
        { name: 'muzzle', role: 'flare_origin' },
        { name: 'stock', role: 'wrist_attach' },
        { name: 'chamber', role: 'flare_chamber' },
        { name: 'sight', role: 'aim_reference' },
        { name: 'hammer', role: 'hammer_attach' },
      ],
      actions: commonActions,
      budget: commonBudget,
    },
  ],
});

export type WeaponAsset = z.infer<typeof weaponAssetSchema>;
export type WeaponActionName = z.infer<typeof weaponActionNameSchema>;
