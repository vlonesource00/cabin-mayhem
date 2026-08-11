import { z } from 'zod';

export const livelinessPropIdSchema = z.enum([
  'pool-cleaning-cart',
  'mall-restock-pallet',
  'laundry-housekeeping-cart',
  'medical-trolley',
  'lifebuoy-emergency-rack',
  'helm-radio-task-console',
]);

export const livelinessPropActionSchema = z.enum(['Idle', 'Use', 'Complete']);

const livelinessBudgetSchema = z.object({
  maxBytes: z.number().int().positive(),
  maxDrawMeshes: z.number().int().positive(),
  maxNodes: z.number().int().positive(),
});

export const livelinessPropSchema = z
  .object({
    id: livelinessPropIdSchema,
    label: z.string().min(1),
    job: z.string().regex(/^[a-z0-9-]+$/),
    sourceFile: z.literal('assets-src/blender/liveliness-props.blend'),
    path: z.string().regex(/^\/assets\/liveliness\/[a-z0-9-]+\.glb$/),
    rootNode: z.string().regex(/^LP_[A-Z0-9_]+_ROOT$/),
    requiredNodes: z.array(z.string().min(1)).length(4),
    requiredActions: z.array(livelinessPropActionSchema).length(3),
    interaction: z.object({
      anchorNode: z.literal('LP_INTERACTION_ANCHOR'),
      action: z.literal('Use'),
      completionAction: z.literal('Complete'),
    }),
    collisionNode: z.literal('LP_COLLISION_BOX'),
    budget: livelinessBudgetSchema,
  })
  .superRefine((asset, context) => {
    if (new Set(asset.requiredNodes).size !== asset.requiredNodes.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${asset.id}: required nodes must be unique`,
      });
    if (!asset.requiredNodes.includes(asset.rootNode))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${asset.id}: root node missing from required nodes`,
      });
    if (!asset.requiredNodes.includes(asset.interaction.anchorNode))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${asset.id}: interaction anchor missing from required nodes`,
      });
    if (!asset.requiredNodes.includes(asset.collisionNode))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${asset.id}: collision node missing from required nodes`,
      });
    if (asset.requiredActions.join('|') !== 'Idle|Use|Complete')
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${asset.id}: semantic action order must be Idle|Use|Complete`,
      });
  });

export const livelinessPropManifestSchema = z
  .object({ assets: z.array(livelinessPropSchema).length(6) })
  .superRefine((manifest, context) => {
    const ids = new Set(manifest.assets.map((asset) => asset.id));
    const paths = new Set(manifest.assets.map((asset) => asset.path));
    if (ids.size !== manifest.assets.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Liveliness prop IDs must be unique',
      });
    if (paths.size !== manifest.assets.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Liveliness prop paths must be unique',
      });
  });

export const livelinessPropManifest = livelinessPropManifestSchema.parse({
  assets: [
    {
      id: 'pool-cleaning-cart',
      label: 'Pool cleaning cart',
      job: 'pool-cleaning',
      sourceFile: 'assets-src/blender/liveliness-props.blend',
      path: '/assets/liveliness/pool-cleaning-cart.glb',
      rootNode: 'LP_POOL_CLEANING_CART_ROOT',
      requiredNodes: [
        'LP_POOL_CLEANING_CART_ROOT',
        'LP_INTERACTION_ANCHOR',
        'LP_COLLISION_BOX',
        'LP_JOB_LABEL',
      ],
      requiredActions: ['Idle', 'Use', 'Complete'],
      interaction: {
        anchorNode: 'LP_INTERACTION_ANCHOR',
        action: 'Use',
        completionAction: 'Complete',
      },
      collisionNode: 'LP_COLLISION_BOX',
      budget: { maxBytes: 180_000, maxDrawMeshes: 32, maxNodes: 48 },
    },
    {
      id: 'mall-restock-pallet',
      label: 'Mall restock pallet',
      job: 'mall-restock',
      sourceFile: 'assets-src/blender/liveliness-props.blend',
      path: '/assets/liveliness/mall-restock-pallet.glb',
      rootNode: 'LP_MALL_RESTOCK_PALLET_ROOT',
      requiredNodes: [
        'LP_MALL_RESTOCK_PALLET_ROOT',
        'LP_INTERACTION_ANCHOR',
        'LP_COLLISION_BOX',
        'LP_JOB_LABEL',
      ],
      requiredActions: ['Idle', 'Use', 'Complete'],
      interaction: {
        anchorNode: 'LP_INTERACTION_ANCHOR',
        action: 'Use',
        completionAction: 'Complete',
      },
      collisionNode: 'LP_COLLISION_BOX',
      budget: { maxBytes: 180_000, maxDrawMeshes: 32, maxNodes: 48 },
    },
    {
      id: 'laundry-housekeeping-cart',
      label: 'Laundry and housekeeping cart',
      job: 'laundry-housekeeping',
      sourceFile: 'assets-src/blender/liveliness-props.blend',
      path: '/assets/liveliness/laundry-housekeeping-cart.glb',
      rootNode: 'LP_LAUNDRY_HOUSEKEEPING_CART_ROOT',
      requiredNodes: [
        'LP_LAUNDRY_HOUSEKEEPING_CART_ROOT',
        'LP_INTERACTION_ANCHOR',
        'LP_COLLISION_BOX',
        'LP_JOB_LABEL',
      ],
      requiredActions: ['Idle', 'Use', 'Complete'],
      interaction: {
        anchorNode: 'LP_INTERACTION_ANCHOR',
        action: 'Use',
        completionAction: 'Complete',
      },
      collisionNode: 'LP_COLLISION_BOX',
      budget: { maxBytes: 180_000, maxDrawMeshes: 32, maxNodes: 48 },
    },
    {
      id: 'medical-trolley',
      label: 'Medical trolley',
      job: 'medical-response',
      sourceFile: 'assets-src/blender/liveliness-props.blend',
      path: '/assets/liveliness/medical-trolley.glb',
      rootNode: 'LP_MEDICAL_TROLLEY_ROOT',
      requiredNodes: [
        'LP_MEDICAL_TROLLEY_ROOT',
        'LP_INTERACTION_ANCHOR',
        'LP_COLLISION_BOX',
        'LP_JOB_LABEL',
      ],
      requiredActions: ['Idle', 'Use', 'Complete'],
      interaction: {
        anchorNode: 'LP_INTERACTION_ANCHOR',
        action: 'Use',
        completionAction: 'Complete',
      },
      collisionNode: 'LP_COLLISION_BOX',
      budget: { maxBytes: 180_000, maxDrawMeshes: 32, maxNodes: 48 },
    },
    {
      id: 'lifebuoy-emergency-rack',
      label: 'Lifebuoy emergency rack',
      job: 'emergency-response',
      sourceFile: 'assets-src/blender/liveliness-props.blend',
      path: '/assets/liveliness/lifebuoy-emergency-rack.glb',
      rootNode: 'LP_LIFEBUOY_EMERGENCY_RACK_ROOT',
      requiredNodes: [
        'LP_LIFEBUOY_EMERGENCY_RACK_ROOT',
        'LP_INTERACTION_ANCHOR',
        'LP_COLLISION_BOX',
        'LP_JOB_LABEL',
      ],
      requiredActions: ['Idle', 'Use', 'Complete'],
      interaction: {
        anchorNode: 'LP_INTERACTION_ANCHOR',
        action: 'Use',
        completionAction: 'Complete',
      },
      collisionNode: 'LP_COLLISION_BOX',
      budget: { maxBytes: 180_000, maxDrawMeshes: 32, maxNodes: 48 },
    },
    {
      id: 'helm-radio-task-console',
      label: 'Helm radio task console',
      job: 'helm-radio-task',
      sourceFile: 'assets-src/blender/liveliness-props.blend',
      path: '/assets/liveliness/helm-radio-task-console.glb',
      rootNode: 'LP_HELM_RADIO_TASK_CONSOLE_ROOT',
      requiredNodes: [
        'LP_HELM_RADIO_TASK_CONSOLE_ROOT',
        'LP_INTERACTION_ANCHOR',
        'LP_COLLISION_BOX',
        'LP_JOB_LABEL',
      ],
      requiredActions: ['Idle', 'Use', 'Complete'],
      interaction: {
        anchorNode: 'LP_INTERACTION_ANCHOR',
        action: 'Use',
        completionAction: 'Complete',
      },
      collisionNode: 'LP_COLLISION_BOX',
      budget: { maxBytes: 180_000, maxDrawMeshes: 32, maxNodes: 48 },
    },
  ],
});

export type LivelinessProp = (typeof livelinessPropManifest.assets)[number];
