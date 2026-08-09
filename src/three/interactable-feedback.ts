import type { ObjectKind } from '../sim/types';

/** The complete interaction surface currently exposed by the game. */
export const currentInteractableFeedbackContract = {
  objects: {
    cart: 'service-cart-stock-pulse',
    'light-case': 'object-light-case-grab-drop',
    'heavy-crate': 'object-heavy-crate-secure',
    toolbox: 'toolbox-carry-sway',
    'supply-bin': 'object-supply-bin-grab-drop',
    drink: 'service-item-drink-hand-off',
    'meal-tray': 'service-item-meal-hand-off',
    medkit: 'service-item-medical-hand-off',
    extinguisher: 'extinguisher-spray-response',
  } satisfies Record<ObjectKind, string>,
  targets: {
    passenger: 'passenger-receive-or-reject',
    'fire-galley': 'fire-flame-and-spray-response',
    'repair-galley-breaker': 'breaker-progress-and-sparks',
    'repair-steering-relay': 'relay-progress-and-handle',
    'bridge-helm': 'helm-wheel-telegraph-response',
    portal: 'portal-arrival-and-door-prompt',
  },
} as const;

export type InteractableObjectKind = keyof typeof currentInteractableFeedbackContract.objects;
export type InteractableTarget = keyof typeof currentInteractableFeedbackContract.targets;

export function feedbackForObjectKind(kind: ObjectKind): string {
  return currentInteractableFeedbackContract.objects[kind];
}

export function feedbackForTarget(target: InteractableTarget): string {
  return currentInteractableFeedbackContract.targets[target];
}

export function feedbackForTargetId(targetId: string): string | undefined {
  if (targetId.startsWith('passenger-')) return feedbackForTarget('passenger');
  if (targetId === 'fire-galley') return feedbackForTarget('fire-galley');
  if (targetId === 'repair-galley-breaker') return feedbackForTarget('repair-galley-breaker');
  if (targetId === 'repair-steering-relay') return feedbackForTarget('repair-steering-relay');
  if (targetId === 'bridge-helm') return feedbackForTarget('bridge-helm');
  return undefined;
}
