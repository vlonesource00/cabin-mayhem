import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesPath = fileURLToPath(new URL('../../src/styles.css', import.meta.url));
const styles = await readFile(stylesPath, 'utf8');

describe('premium cruise operations HUD theme', () => {
  it('keeps theme tokens scoped to the existing game shell', () => {
    expect(styles).toContain('/* --- premium cruise operations HUD');
    expect(styles).toMatch(/\.game-shell\s*\{[\s\S]*--hud-navy-950:/);
    for (const token of [
      '--hud-teal-500:',
      '--hud-brass-500:',
      '--hud-coral-500:',
      '--hud-ink:',
      '--hud-focus:',
    ]) {
      expect(styles).toContain(token);
    }
  });

  it('styles existing operational states without changing their selectors', () => {
    for (const selector of [
      '.game-shell .flight-chip',
      '.game-shell .critical-icon',
      '.game-shell .interaction-pill',
      '.game-shell .objective-card',
      ".game-shell .objective-card[data-kind='fire']",
      ".game-shell .objective-card[data-kind='navigation']",
      ".game-shell .objective-card[data-kind='invasion']",
      '.game-shell .navigation-alert',
      '.game-shell .radio-caption',
      '.game-shell .room-chip',
      '.game-shell .dev-toggle',
      '.game-shell .dev-drawer',
      ".game-shell[data-room-phase='connected'] .room-chip",
      ".game-shell[data-room-phase='error'] .room-chip",
    ]) {
      expect(styles).toContain(selector);
    }
    expect(styles).toContain('.navigation-alert[hidden]');
  });

  it('defines keyboard, motion, and narrow-viewport contracts', () => {
    const theme = styles.slice(styles.lastIndexOf('/* --- premium cruise operations HUD'));
    const mobileTheme = theme.slice(theme.lastIndexOf('@media (max-width: 680px)'));
    const reducedMotion = theme.slice(theme.lastIndexOf('@media (prefers-reduced-motion: reduce)'));

    expect(styles).toContain('.game-shell button:focus-visible');
    expect(styles).toContain('outline: 3px solid var(--hud-focus)');
    expect(styles).toContain('@media (max-width: 680px)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('backdrop-filter: none');
    expect(mobileTheme).toMatch(/\.game-shell \.interaction-pill \{[^}]*bottom: 184px;/s);
    expect(mobileTheme).toMatch(/\.game-shell \.room-chip \{[^}]*bottom: 108px;/s);
    expect(mobileTheme).not.toMatch(/\.game-shell \.interaction-pill \{[^}]*bottom: 108px;/s);
    expect(reducedMotion).toContain('transition: none;');
    expect(reducedMotion).toContain('transform: none;');
  });
});
