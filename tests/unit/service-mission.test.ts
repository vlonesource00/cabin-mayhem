import { describe, expect, it } from 'vitest';
import { createFlightState } from '../../src/sim/flight-model';
import {
  applyCabinIncident,
  createServiceMission,
  deliverServiceItem,
  restockServiceCartItem,
  stepServiceMission,
  takeServiceCartItem,
} from '../../src/sim/service-mission';
import type { CabinObject, ServiceNeed, Vec2 } from '../../src/sim/types';

describe('cabin service mission', () => {
  it('starts with eight passengers and all three request types active', () => {
    const service = createServiceMission();
    const active = Object.values(service.passengers).filter(
      (passenger) => passenger.requestStatus === 'active',
    );
    expect(Object.keys(service.passengers)).toHaveLength(8);
    expect(new Set(active.map((passenger) => passenger.need))).toEqual(
      new Set(['drink', 'meal', 'medical']),
    );
  });

  it('dispenses authored cart stock and accepts unused service items back', () => {
    const service = createServiceMission();
    expect(service.cart.stock).toEqual({ drink: 3, meal: 3, medical: 2 });

    const taken = takeServiceCartItem(service, 'medical', { x: 7, y: 16 }, 'crew-alpha');
    expect(taken.accepted).toBe(true);
    expect(taken.service.cart.stock.medical).toBe(1);
    expect(taken.object).toMatchObject({ ownerId: 'crew-alpha', serviceNeed: 'medical' });

    const returned = restockServiceCartItem(taken.service, taken.object!);
    expect(returned.accepted).toBe(true);
    expect(returned.service.cart.stock.medical).toBe(2);
  });

  it('accepts only the requested item and converts patience into score', () => {
    const service = createServiceMission();
    const passenger = service.passengers['passenger-ana']!;
    const wrong = deliverServiceItem(
      service,
      passenger.id,
      serviceObject('meal', passenger.servicePosition),
      passenger.servicePosition,
    );
    expect(wrong.accepted).toBe(false);
    expect(wrong.service.score).toBe(-15);

    const correct = deliverServiceItem(
      wrong.service,
      passenger.id,
      serviceObject('drink', passenger.servicePosition),
      passenger.servicePosition,
    );
    expect(correct.accepted).toBe(true);
    expect(correct.consumed).toBe(true);
    expect(correct.service.passengers[passenger.id]!.requestStatus).toBe('served');
    expect(correct.service.score).toBeGreaterThan(100);
  });

  it('turns aircraft incidents into passenger panic and injury', () => {
    const service = createServiceMission();
    const turbulent = applyCabinIncident(service, 'turbulence', 0.9);
    const collided = applyCabinIncident(turbulent, 'collision', 1);
    expect(
      Math.max(...Object.values(collided.passengers).map((entry) => entry.panic)),
    ).toBeGreaterThan(0.6);
    expect(
      Math.max(...Object.values(collided.passengers).map((entry) => entry.injury)),
    ).toBeGreaterThan(0.4);
  });

  it('resolves a successful landing after three correct deliveries', () => {
    let service = createServiceMission();
    for (const id of ['passenger-ana', 'passenger-malik', 'passenger-sofia']) {
      const passenger = service.passengers[id]!;
      service = deliverServiceItem(
        service,
        id,
        serviceObject(passenger.need, passenger.servicePosition),
        passenger.servicePosition,
      ).service;
    }
    const flight = { ...createFlightState(), phase: 'landed' as const };
    expect(stepServiceMission(service, flight, 1 / 60).outcome).toBe('success');
  });
});

function serviceObject(serviceNeed: ServiceNeed, position: Vec2): CabinObject {
  return {
    id: `test-${serviceNeed}`,
    name: `Test ${serviceNeed}`,
    kind: serviceNeed === 'meal' ? 'meal-tray' : serviceNeed === 'medical' ? 'medkit' : 'drink',
    material: 'plastic',
    position,
    velocity: { x: 0, y: 0 },
    radius: 0.25,
    mass: 1,
    friction: 0.4,
    impactTolerance: 1,
    secured: false,
    damage: 0,
    serviceNeed,
  };
}
