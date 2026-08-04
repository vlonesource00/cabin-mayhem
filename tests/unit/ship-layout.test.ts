import { describe, expect, it } from 'vitest';
import {
  compartmentById,
  defaultCompartmentId,
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
    const distances = portalDistances('atrium');
    expect(distances.get('atrium')).toBe(0);
    expect(distances.get('bridge')).toBe(1);
    expect(distances.get('cabin-corridor-a')).toBe(1);
    expect(distances.get('engine-room')).toBe(2);
  });

  it('keeps neighbours full, two hops reduced and nothing beyond', () => {
    const resident = residency('atrium');
    expect(resident.get('atrium')).toBe('full');
    expect(resident.get('bridge')).toBe('full');
    expect(resident.get('cabin-corridor-a')).toBe('full');
    expect(resident.get('engine-room')).toBe('reduced');

    // From the bridge the engine room is three hops away and must not be
    // resident at all.
    expect(residency('bridge').has('engine-room')).toBe(false);
  });

  it('holds every compartment to a budget the performance doc can enforce', () => {
    for (const compartment of shipLayout.compartments) {
      expect(compartment.budget.maxDrawMeshes).toBeLessThanOrEqual(40);
      expect(compartment.budget.maxBytes).toBeLessThanOrEqual(3_145_728);
    }
  });
});
