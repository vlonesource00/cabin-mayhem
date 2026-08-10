import {
  BEAM,
  compartmentById,
  DRAUGHT,
  deckFloorY,
  halfBeamAt,
  LOA,
  shipLayout,
  TOP_DECK,
  type CompartmentDefinition,
} from '../data/ship-layout';

/**
 * The ship's plan, drawn from `src/data/ship-layout.ts` and nothing else.
 *
 * A player standing in a corridor two decks below the waterline has no way to
 * learn the shape of the vessel they are on. The exterior tells them at a
 * glance from an open deck and tells them nothing at all from inside, which is
 * where most of a shift is spent. This draws what the exterior cannot: a
 * longitudinal section with every compartment in its real place, and a plan of
 * the deck being walked, both at one true scale.
 *
 * It is deliberately built from the layout rather than from the GLBs. The
 * layout is the ship — the streamer greyboxes from these same numbers when an
 * asset is missing — so the plan stays honest even when nothing has loaded, and
 * a room that moves in the data moves here without anyone redrawing anything.
 */

/**
 * Pixels per metre, used for both panels and both axes.
 *
 * Brochure deck plans stretch the vertical so the deck names fit, and lie about
 * the ship's proportions doing it. At five pixels a metre a 3.2 m deck is 16 px
 * — enough to read — so the section can stay at true scale and the stack of
 * decks reads as tall as it actually is.
 */
const PX_PER_M = 5;

/** Room at the edges for the deck numbers and the frame, in pixels. */
const MARGIN = 26;

/** Height of the caption strip above each panel, in pixels. */
const CAPTION = 22;

/** Sky drawn above the topmost authored deck, in metres. */
const HEADROOM = 4;

/** The freeboard deck: the sheer line the hull profile is drawn up to. */
const SHEER_Y = 8.8;

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const round = (value: number): number => Math.round(value * 100) / 100;

/** The decks a compartment stands on: a stair tower occupies all of them. */
export function decksOccupied(compartment: CompartmentDefinition): number[] {
  const decks: number[] = [];
  for (let deck = 0; deck < compartment.decksTall; deck += 1) {
    decks.push(compartment.deck + deck);
  }
  return decks;
}

/** Every compartment with floor or void on `deck`, bow-first. */
export function compartmentsOnDeck(deck: number): CompartmentDefinition[] {
  return shipLayout.compartments
    .filter((compartment) => decksOccupied(compartment).includes(deck))
    .slice()
    .sort((left, right) => right.anchor.z - left.anchor.z);
}

/** Highest point any authored compartment reaches, in metres. */
function authoredTop(): number {
  let top = SHEER_Y;
  for (const compartment of shipLayout.compartments) {
    top = Math.max(top, deckFloorY(compartment.deck) + compartment.size.y);
  }
  return top;
}

export interface DeckPlanOptions {
  /** The occupied compartment. Highlighted, and it picks the plan's deck. */
  current?: string;
}

interface Frame {
  /** Ship z, metres, to panel x, pixels. Bow to the right. */
  x(z: number): number;
  /** Panel width in pixels. */
  readonly width: number;
}

const lengthwise: Frame = {
  x: (z) => MARGIN + (z + LOA / 2) * PX_PER_M,
  width: MARGIN * 2 + LOA * PX_PER_M,
};

/**
 * The section: ship y upwards, so the panel's own y counts down from the sky.
 *
 * The top is taken from the tallest authored compartment rather than from the
 * air draught, because the masts reach 45 m and drawing to there would spend
 * half the panel on empty sky above a ship that stops at 25.
 */
function sectionY(y: number): number {
  return CAPTION + (authoredTop() + HEADROOM - y) * PX_PER_M;
}

const sectionHeight = (): number => CAPTION + (authoredTop() + HEADROOM + DRAUGHT) * PX_PER_M;

/**
 * The plan: ship x abeam, starboard at the top.
 *
 * Not a stylistic choice. Looking down on a ship whose bow points right, the
 * axis left over is +X, and it points up the page — drawing port up would be a
 * view from under the keel with the decks mirrored.
 */
function planX(x: number): number {
  return CAPTION + (BEAM / 2 - x) * PX_PER_M;
}

const planHeight = CAPTION + BEAM * PX_PER_M;

/** The hull in profile: transom aft, flat keel, raked stem forward. */
function hullProfilePath(): string {
  const x = lengthwise.x;
  const half = LOA / 2;
  const keel = sectionY(-DRAUGHT);
  return [
    `M ${round(x(-half))} ${round(sectionY(SHEER_Y))}`,
    `L ${round(x(-half))} ${round(sectionY(-2))}`,
    `Q ${round(x(-half + 11))} ${round(keel)} ${round(x(-half + 25))} ${round(keel)}`,
    `L ${round(x(half - 40))} ${round(keel)}`,
    `Q ${round(x(half - 7))} ${round(keel)} ${round(x(half))} ${round(sectionY(SHEER_Y))}`,
    'Z',
  ].join(' ');
}

/** The hull in plan, from the same half-beam curve the exterior is lofted on. */
function hullPlanPath(): string {
  const half = LOA / 2;
  const starboard: string[] = [];
  const port: string[] = [];
  const stations = LOA / 5;
  for (let station = 0; station <= stations; station += 1) {
    const z = -half + (station * LOA) / stations;
    const beam = halfBeamAt(z);
    starboard.push(`${round(lengthwise.x(z))} ${round(planX(beam))}`);
    port.unshift(`${round(lengthwise.x(z))} ${round(planX(-beam))}`);
  }
  return `M ${starboard.join(' L ')} L ${port.join(' L ')} Z`;
}

/** Whether a compartment is the one being walked, or merely on the same deck. */
function stateOf(compartment: CompartmentDefinition, current?: string): string {
  if (compartment.id === current) return 'current';
  return compartment.exposure === 'exterior' ? 'weather' : 'room';
}

function box(
  compartment: CompartmentDefinition,
  current: string | undefined,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  return (
    `<g class="deck-plan__room" data-room="${compartment.id}" data-state="${stateOf(compartment, current)}">` +
    `<rect x="${round(left)}" y="${round(top)}" width="${round(width)}" height="${round(height)}" rx="2" />` +
    `<text x="${round(left + width / 2)}" y="${round(top + height / 2)}">${escape(compartment.label)}</text>` +
    '</g>'
  );
}

/** The section, with every compartment on the ship in its real place. */
function sectionPanel(current?: string): string {
  const parts: string[] = [
    '<text class="deck-plan__caption" x="' +
      MARGIN +
      '" y="14">LONGITUDINAL SECTION / LOOKING TO PORT / BOW RIGHT</text>',
    `<path class="deck-plan__hull" d="${hullProfilePath()}" />`,
    `<line class="deck-plan__waterline" x1="${round(lengthwise.x(-LOA / 2) - 12)}" y1="${round(sectionY(0))}" ` +
      `x2="${round(lengthwise.x(LOA / 2) + 12)}" y2="${round(sectionY(0))}" />`,
  ];
  for (let deck = 0; deck <= TOP_DECK; deck += 1) {
    const y = round(sectionY(deckFloorY(deck)));
    parts.push(
      `<line class="deck-plan__deckline" x1="${MARGIN}" y1="${y}" x2="${round(lengthwise.width - MARGIN)}" y2="${y}" />`,
      `<text class="deck-plan__deckno" x="${MARGIN - 6}" y="${y - 3}">${deck}</text>`,
    );
  }
  for (const compartment of shipLayout.compartments) {
    const floor = deckFloorY(compartment.deck);
    parts.push(
      box(
        compartment,
        current,
        lengthwise.x(compartment.anchor.z - compartment.size.z / 2),
        sectionY(floor + compartment.size.y),
        compartment.size.z * PX_PER_M,
        compartment.size.y * PX_PER_M,
      ),
    );
  }
  // Every doorway on the ship, stated once. Both sides of a portal resolve to
  // the same point — `pnpm validate:data` proves it — so one tick is the pair.
  for (const compartment of shipLayout.compartments) {
    for (const portal of compartment.portals) {
      const z = compartment.anchor.z + portal.position.z;
      const y = deckFloorY(compartment.deck) + portal.position.y;
      parts.push(
        `<rect class="deck-plan__door" x="${round(lengthwise.x(z) - 1.5)}" y="${round(sectionY(y + 2.1))}" ` +
          `width="3" height="${round(2.1 * PX_PER_M)}" />`,
      );
    }
  }
  return `<g class="deck-plan__panel" data-panel="section">${parts.join('')}</g>`;
}

/** The plan of one deck, inside the hull's own waterplane at that station. */
function planPanel(deck: number, current?: string): string {
  const rooms = compartmentsOnDeck(deck);
  const parts: string[] = [
    `<text class="deck-plan__caption" x="${MARGIN}" y="14">DECK ${deck} PLAN / STARBOARD AT THE TOP / ` +
      `${rooms.length} COMPARTMENT${rooms.length === 1 ? '' : 'S'}</text>`,
    `<path class="deck-plan__hull" d="${hullPlanPath()}" />`,
    `<line class="deck-plan__centreline" x1="${MARGIN}" y1="${round(planX(0))}" ` +
      `x2="${round(lengthwise.width - MARGIN)}" y2="${round(planX(0))}" />`,
  ];
  for (const compartment of rooms) {
    parts.push(
      box(
        compartment,
        current,
        lengthwise.x(compartment.anchor.z - compartment.size.z / 2),
        planX(compartment.anchor.x + compartment.size.x / 2),
        compartment.size.z * PX_PER_M,
        compartment.size.x * PX_PER_M,
      ),
    );
  }
  for (const compartment of rooms) {
    for (const portal of compartment.portals) {
      // A stair tower carries one portal per landing at the same x and z, so in
      // plan they stack into a single mark. That is correct: it is one doorway.
      const z = compartment.anchor.z + portal.position.z;
      const x = compartment.anchor.x + portal.position.x;
      parts.push(
        `<rect class="deck-plan__door" x="${round(lengthwise.x(z) - 1.5)}" y="${round(planX(x + 1.1))}" ` +
          `width="3" height="${round(2.2 * PX_PER_M)}" />`,
      );
    }
  }
  return `<g class="deck-plan__panel" data-panel="plan" transform="translate(0 ${round(sectionHeight() + CAPTION)})">${parts.join('')}</g>`;
}

/**
 * The whole plan as standalone SVG markup.
 *
 * Returned as a string rather than as DOM so it can be asserted on in a
 * headless test, which is the only kind of verification this project has.
 */
export function buildDeckPlan(options: DeckPlanOptions = {}): string {
  const current = options.current;
  const occupied = current ? compartmentById(current) : undefined;
  const deck = occupied?.deck ?? 2;
  const height = sectionHeight() + CAPTION + planHeight + MARGIN;
  const title = occupied ? `${occupied.label}, deck ${occupied.deck}` : 'MS Cabin Mayhem';
  return (
    `<svg class="deck-plan__sheet" viewBox="0 0 ${round(lengthwise.width)} ${round(height)}" ` +
    `role="img" aria-label="Deck plan of the MS Cabin Mayhem. You are in ${escape(title)}." ` +
    `data-deck="${deck}" data-current="${escape(current ?? '')}" ` +
    'xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
    sectionPanel(current) +
    planPanel(deck, current) +
    '</svg>'
  );
}
