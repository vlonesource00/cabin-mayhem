import { describe, expect, it } from 'vitest';
import {
  compartmentById,
  defaultCompartmentId,
  exteriorTier,
  portalDistances,
  residency,
  shipLayout,
  shipLayoutSchema,
} from '../../src/data/ship-layout';

describe('ship layout', () => {
  it('parses against its own schema', () => {
    expect(shipLayoutSchema.safeParse(shipLayout).success).toBe(true);
  });

  it('resolves compartments by id and rejects unknown ones', () => {
    expect(compartmentById(defaultCompartmentId)?.label).toBeTruthy();
    expect(compartmentById('boiler-room')).toBeUndefined();
  });

  it('declares every portal from both sides', () => {
    for (const compartment of shipLayout.compartments) {
      for (const portal of compartment.portals) {
        const target = compartmentById(portal.target);
        expect(target, `${compartment.id} -> ${portal.target}`).toBeDefined();
        expect(target?.portals.some((back) => back.target === compartment.id)).toBe(true);
      }
    }
  });

  it('measures portal hops from the occupied compartment', () => {
    // The atrium opens onto two stair towers, and everything else on the ship
    // is reached through one of them, so the graph fans out from the shafts
    // rather than from the rooms.
    const distances = portalDistances('atrium');
    expect(distances.get('atrium')).toBe(0);
    expect(distances.get('stairwell-aft')).toBe(1);
    expect(distances.get('stairwell-mid')).toBe(1);
    expect(distances.get('engine-room')).toBe(2);
    expect(distances.get('dining-room')).toBe(2);
    expect(distances.get('bridge')).toBe(4);
  });

  it('keeps neighbours full, two hops reduced and nothing beyond', () => {
    const resident = residency('atrium');
    expect(resident.get('atrium')).toBe('full');
    expect(resident.get('stairwell-aft')).toBe('full');
    expect(resident.get('stairwell-mid')).toBe('full');
    expect(resident.get('engine-room')).toBe('reduced');
    expect(resident.get('sun-deck')).toBe('reduced');

    // From the bridge the engine room is six hops away and must not be
    // resident at all.
    expect(residency('bridge').has('engine-room')).toBe(false);
  });

  it('picks the exterior tier from exposure and glazing', () => {
    expect(exteriorTier('pool-deck')).toBe('X0');
    expect(exteriorTier('dining-room')).toBe('X1');
    expect(exteriorTier('stairwell-aft')).toBe('X2');
    // The wheelhouse is glazed and interior, which would ordinarily be X1, but
    // its windows look down the foredeck at the very dressing X1 removes.
    expect(exteriorTier('bridge')).toBe('X0');
    // Failing to draw the ship is worse than drawing it too well, so an id the
    // layout does not know still gets the full hull.
    expect(exteriorTier('boiler-room')).toBe('X0');
  });

  it('never declares an open deck unglazed, which would hide the ship underfoot', () => {
    for (const compartment of shipLayout.compartments) {
      if (compartment.exposure !== 'exterior') continue;
      expect(compartment.glazed, compartment.id).toBe(true);
    }
  });

  it('holds every compartment to a budget the performance doc can enforce', () => {
    for (const compartment of shipLayout.compartments) {
      expect(compartment.budget.maxDrawMeshes).toBeLessThanOrEqual(320);
      expect(compartment.budget.maxBytes).toBeLessThanOrEqual(25_165_824);
    }
  });
});
