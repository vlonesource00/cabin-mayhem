import { describe, expect, it } from 'vitest';
import {
  currentInteractableFeedbackContract,
  feedbackForObjectKind,
  feedbackForTarget,
  feedbackForTargetId,
} from '../../src/three/interactable-feedback';

describe('current interactable feedback contract', () => {
  it('maps every authored object kind to a readable feedback state', () => {
    const kinds = [
      'cart',
      'light-case',
      'heavy-crate',
      'toolbox',
      'supply-bin',
      'drink',
      'meal-tray',
      'medkit',
      'extinguisher',
    ] as const;
    for (const kind of kinds) expect(feedbackForObjectKind(kind)).toMatch(/\S/);
    expect(Object.keys(currentInteractableFeedbackContract.objects)).toHaveLength(kinds.length);
  });

  it('maps every current special interaction path', () => {
    const targets = [
      'passenger',
      'fire-galley',
      'repair-galley-breaker',
      'repair-steering-relay',
      'bridge-helm',
      'portal',
    ] as const;
    for (const target of targets) expect(feedbackForTarget(target)).toMatch(/\S/);
    expect(feedbackForTargetId('passenger-ana')).toBe(feedbackForTarget('passenger'));
    expect(feedbackForTargetId('repair-steering-relay')).toBe(
      feedbackForTarget('repair-steering-relay'),
    );
    expect(feedbackForTargetId('unknown-target')).toBeUndefined();
  });
});
