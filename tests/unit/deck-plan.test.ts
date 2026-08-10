import { describe, expect, it } from 'vitest';
import { buildDeckPlan, compartmentsOnDeck, decksOccupied } from '../../src/app/deck-plan';
import { compartmentById, shipLayout } from '../../src/data/ship-layout';

/**
 * The plan is markup, not DOM, so it can be read here — the unit suite runs in
 * node and this project has no way to verify anything in a live browser.
 */

/** Every `<rect>` in a chunk of the sheet, as numbers. */
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rects(markup: string): Rect[] {
  const found: Rect[] = [];
  const pattern =
    /<rect [^>]*x="(-?[\d.]+)" y="(-?[\d.]+)" width="(-?[\d.]+)" height="(-?[\d.]+)"/g;
  for (const match of markup.matchAll(pattern)) {
    found.push({
      x: Number(match[1]),
      y: Number(match[2]),
      width: Number(match[3]),
      height: Number(match[4]),
    });
  }
  return found;
}

/** The two panels, split where the plan's own group begins. */
function panels(sheet: string): { section: string; plan: string; planOffset: number } {
  const start = sheet.indexOf('<g class="deck-plan__panel" data-panel="plan"');
  expect(start).toBeGreaterThan(0);
  const plan = sheet.slice(start);
  const offset = /data-panel="plan" transform="translate\(0 ([\d.]+)\)"/.exec(plan);
  expect(offset).not.toBeNull();
  return { section: sheet.slice(0, start), plan, planOffset: Number(offset![1]) };
}

const roomsIn = (markup: string): string[] =>
  [...markup.matchAll(/data-room="([a-z0-9-]+)"/g)].map((match) => match[1]!);

describe('decksOccupied', () => {
  it('counts every deck a compartment stands on, not just its lowest', () => {
    for (const compartment of shipLayout.compartments) {
      const decks = decksOccupied(compartment);
      expect(decks).toHaveLength(compartment.decksTall);
      expect(decks[0]).toBe(compartment.deck);
      expect(decks.at(-1)).toBe(compartment.deck + compartment.decksTall - 1);
    }
  });
});

describe('compartmentsOnDeck', () => {
  it('places every compartment on at least one deck', () => {
    const placed = new Set<string>();
    for (let deck = 0; deck <= 9; deck += 1) {
      for (const compartment of compartmentsOnDeck(deck)) placed.add(compartment.id);
    }
    expect(placed.size).toBe(shipLayout.compartments.length);
  });

  it('reads bow-first, the way a plan with the bow to the right is read', () => {
    const rooms = compartmentsOnDeck(2);
    expect(rooms.length).toBeGreaterThan(1);
    for (let index = 1; index < rooms.length; index += 1) {
      expect(rooms[index]!.anchor.z).toBeLessThanOrEqual(rooms[index - 1]!.anchor.z);
    }
  });
});

describe('buildDeckPlan', () => {
  it('draws the whole ship in section and one deck in plan', () => {
    const atrium = compartmentById('atrium')!;
    const sheet = buildDeckPlan({ current: 'atrium' });
    const { section, plan } = panels(sheet);

    // The section is the ship: nothing authored may be missing from it.
    expect(new Set(roomsIn(section))).toEqual(
      new Set(shipLayout.compartments.map((compartment) => compartment.id)),
    );
    // The plan is one deck: exactly the compartments standing on it.
    expect(roomsIn(plan)).toEqual(compartmentsOnDeck(atrium.deck).map((room) => room.id));
    expect(sheet).toContain(`data-deck="${atrium.deck}"`);
  });

  it('marks the occupied room, once, on both panels', () => {
    const sheet = buildDeckPlan({ current: 'engine-room' });
    const { section, plan } = panels(sheet);
    expect([...section.matchAll(/data-state="current"/g)]).toHaveLength(1);
    expect([...plan.matchAll(/data-state="current"/g)]).toHaveLength(1);
    expect(section).toContain('data-room="engine-room" data-state="current"');
    expect(sheet).toContain('data-current="engine-room"');
    expect(sheet).toContain('You are in ');
  });

  it('follows the crew up the ship', () => {
    const promenade = compartmentById('promenade')!;
    const sheet = buildDeckPlan({ current: 'promenade' });
    expect(sheet).toContain(`data-deck="${promenade.deck}"`);
    // Open deck reads differently from a room you can be shut inside.
    expect(sheet).toContain('data-room="promenade" data-state="current"');
    const other = compartmentsOnDeck(promenade.deck).find(
      (room) => room.id !== promenade.id && room.exposure === 'exterior',
    );
    if (other) expect(sheet).toContain(`data-room="${other.id}" data-state="weather"`);
  });

  it('stands alone with no crew aboard', () => {
    const sheet = buildDeckPlan();
    expect(sheet).toContain('data-deck="2"');
    expect(sheet).toContain('data-current=""');
    expect(sheet).not.toContain('data-state="current"');
  });

  it('states one doorway tick per portal', () => {
    const { section } = panels(buildDeckPlan());
    const portals = shipLayout.compartments.reduce(
      (total, compartment) => total + compartment.portals.length,
      0,
    );
    expect([...section.matchAll(/class="deck-plan__door"/g)]).toHaveLength(portals);
  });

  it('keeps every mark on the sheet', () => {
    const sheet = buildDeckPlan({ current: 'atrium' });
    const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(sheet);
    expect(viewBox).not.toBeNull();
    const width = Number(viewBox![1]);
    const height = Number(viewBox![2]);
    const { section, plan, planOffset } = panels(sheet);

    // A room drawn past the edge of the sheet is a room the player cannot read.
    for (const rect of rects(section)) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.y + rect.height).toBeLessThanOrEqual(height);
    }
    for (const rect of rects(plan)) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
      expect(rect.y + planOffset).toBeGreaterThanOrEqual(0);
      expect(rect.y + rect.height + planOffset).toBeLessThanOrEqual(height);
    }
  });

  it('draws the hull at the same true scale on both panels', () => {
    const sheet = buildDeckPlan();
    // Two hull paths, one per panel, and both lengths come off the same
    // metres-to-pixels mapping — so the plan cannot lie about the proportions.
    const hulls = [...sheet.matchAll(/class="deck-plan__hull" d="([^"]+)"/g)];
    expect(hulls).toHaveLength(2);
    // Every command in these paths takes coordinate pairs — including `Q`, whose
    // control point and endpoint are both x,y — so the x values are the evens.
    const extent = (path: string): [number, number] => {
      const numbers = [...path.matchAll(/-?[\d.]+/g)].map((match) => Number(match[0]));
      const xs = numbers.filter((_, index) => index % 2 === 0);
      return [Math.min(...xs), Math.max(...xs)];
    };
    const [profileMin, profileMax] = extent(hulls[0]![1]!);
    const [planMin, planMax] = extent(hulls[1]![1]!);
    expect(planMin).toBeCloseTo(profileMin, 6);
    expect(planMax).toBeCloseTo(profileMax, 6);
  });
});
