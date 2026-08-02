import { serviceSliceDefinition, type PassengerDefinition } from '../data/service';
import { clamp, distance } from './math';
import type {
  CabinObject,
  FlightState,
  PassengerState,
  ServiceMissionState,
  ServiceNeed,
} from './types';

export type CabinIncident =
  'turbulence' | 'air-pocket' | 'sharp-turn' | 'collision' | 'fire' | 'repair';

export interface DeliveryResult {
  service: ServiceMissionState;
  accepted: boolean;
  consumed: boolean;
  message: string;
}

export interface CartItemResult {
  service: ServiceMissionState;
  object?: CabinObject;
  accepted: boolean;
  message: string;
}

export function createServiceMission(): ServiceMissionState {
  const passengers = serviceSliceDefinition.passengers.map(passengerFromDefinition);
  const stock = initialCartStock();
  return {
    elapsed: 0,
    duration: serviceSliceDefinition.duration,
    score: 0,
    served: 0,
    missed: 0,
    outcome: 'active',
    cart: { stock, capacity: { ...stock }, nextItemSerial: 1 },
    passengers: Object.fromEntries(passengers.map((passenger) => [passenger.id, passenger])),
  };
}

export function takeServiceCartItem(
  current: ServiceMissionState,
  need: ServiceNeed,
  position: { x: number; y: number },
  ownerId: string,
): CartItemResult {
  if (current.outcome !== 'active')
    return { service: current, accepted: false, message: 'Service cart locked after mission end' };
  if (current.cart.stock[need] <= 0)
    return { service: current, accepted: false, message: `Service cart has no ${need} stock` };
  const templates = serviceSliceDefinition.objects.filter(
    (entry) => 'serviceNeed' in entry && entry.serviceNeed === need,
  );
  const template = templates[(current.cart.nextItemSerial - 1) % templates.length];
  if (!template)
    return { service: current, accepted: false, message: `No ${need} item is authored` };
  const serial = current.cart.nextItemSerial;
  const service: ServiceMissionState = {
    ...current,
    cart: {
      ...current.cart,
      stock: { ...current.cart.stock, [need]: current.cart.stock[need] - 1 },
      nextItemSerial: serial + 1,
    },
  };
  return {
    service,
    accepted: true,
    object: {
      id: `cart-${need}-${serial}`,
      name: template.name,
      kind: template.kind,
      material: template.material,
      position: { ...position },
      velocity: { x: 0, y: 0 },
      radius: template.radius,
      mass: template.mass,
      friction: template.friction,
      impactTolerance: template.impactTolerance,
      secured: false,
      ownerId,
      damage: 0,
      serviceNeed: need,
    },
    message: `Took ${template.name} from service cart`,
  };
}

export function restockServiceCartItem(
  current: ServiceMissionState,
  object: CabinObject,
): CartItemResult {
  const need = object.serviceNeed;
  if (!need)
    return { service: current, accepted: false, message: `${object.name} cannot be stocked` };
  if (current.cart.stock[need] >= current.cart.capacity[need])
    return { service: current, accepted: false, message: `${need} stock is already full` };
  return {
    service: {
      ...current,
      cart: {
        ...current.cart,
        stock: { ...current.cart.stock, [need]: current.cart.stock[need] + 1 },
      },
    },
    accepted: true,
    message: `Returned ${object.name} to service cart`,
  };
}

export function stepServiceMission(
  current: ServiceMissionState,
  flight: FlightState,
  deltaSeconds: number,
): ServiceMissionState {
  if (current.outcome !== 'active') return current;
  const dt = clamp(deltaSeconds, 0, 0.05);
  const elapsed = current.elapsed + dt;
  let missed = current.missed;
  let score = current.score;
  const passengers = Object.fromEntries(
    Object.entries(current.passengers).map(([id, passenger]) => {
      const next = { ...passenger };
      if (next.requestStatus === 'pending' && elapsed >= next.requestAt)
        next.requestStatus = 'active';
      if (next.requestStatus === 'active') {
        const stress = 1 + next.panic * 0.8 + next.injury * 0.9;
        next.patience = clamp(next.patience - (dt / 150) * stress, 0, 1);
        if (next.patience <= 0) {
          next.requestStatus = 'missed';
          next.satisfaction = 0;
          missed += 1;
          score -= 75;
        }
      }
      next.panic = clamp(next.panic - dt * 0.012, 0, 1);
      return [id, next];
    }),
  ) as ServiceMissionState['passengers'];

  const terminal = terminalOutcome(flight, elapsed, current.duration, current.served, missed);
  return { ...current, elapsed, score, missed, passengers, outcome: terminal };
}

export function applyCabinIncident(
  current: ServiceMissionState,
  incident: CabinIncident,
  severity: number,
): ServiceMissionState {
  if (current.outcome !== 'active') return current;
  const strength = clamp(severity, 0, 1);
  const passengers = Object.fromEntries(
    Object.entries(current.passengers).map(([id, passenger], index) => {
      const exposed = 0.65 + ((index * 37) % 31) / 100;
      const panic =
        incident === 'collision'
          ? 0.55
          : incident === 'fire'
            ? 0.48
            : incident === 'air-pocket'
              ? 0.38
              : 0.26;
      const injury =
        incident === 'collision'
          ? strength * exposed * 0.48
          : incident === 'fire'
            ? strength * exposed * 0.22
            : incident === 'air-pocket'
              ? strength * exposed * 0.13
              : 0;
      return [
        id,
        {
          ...passenger,
          panic: clamp(passenger.panic + panic * strength, 0, 1),
          injury: clamp(passenger.injury + injury, 0, 1),
          patience: clamp(
            passenger.patience -
              strength * (incident === 'fire' ? 0.11 : incident === 'repair' ? 0.025 : 0.04),
            0,
            1,
          ),
        },
      ];
    }),
  ) as ServiceMissionState['passengers'];
  return {
    ...current,
    passengers,
    score: current.score - (incident === 'fire' ? 35 : incident === 'repair' ? 8 : 0),
  };
}

export function deliverServiceItem(
  current: ServiceMissionState,
  passengerId: string,
  object: CabinObject,
  playerPosition: { x: number; y: number },
): DeliveryResult {
  const passenger = current.passengers[passengerId];
  if (!passenger)
    return { service: current, accepted: false, consumed: false, message: 'Passenger unavailable' };
  if (distance(playerPosition, passenger.servicePosition) > 3.8)
    return {
      service: current,
      accepted: false,
      consumed: false,
      message: `${passenger.name} is out of reach`,
    };
  if (passenger.requestStatus !== 'active')
    return {
      service: current,
      accepted: false,
      consumed: false,
      message: `${passenger.name} has no active request`,
    };
  if (!object.serviceNeed || object.serviceNeed !== passenger.need) {
    const service = { ...current, score: current.score - 15 };
    return {
      service,
      accepted: false,
      consumed: false,
      message: `${passenger.name} needs ${needLabel(passenger.need)}, not ${object.name}`,
    };
  }

  const nextPassenger: PassengerState = {
    ...passenger,
    requestStatus: 'served',
    satisfaction: clamp(0.45 + passenger.patience * 0.55, 0, 1),
    panic: clamp(passenger.panic - (passenger.need === 'medical' ? 0.55 : 0.18), 0, 1),
    injury: passenger.need === 'medical' ? clamp(passenger.injury - 0.72, 0, 1) : passenger.injury,
  };
  const bonus = Math.round(100 + passenger.patience * 50 + (passenger.need === 'medical' ? 40 : 0));
  return {
    service: {
      ...current,
      score: current.score + bonus,
      served: current.served + 1,
      passengers: { ...current.passengers, [passengerId]: nextPassenger },
    },
    accepted: true,
    consumed: true,
    message: `${passenger.name} received ${object.name} +${bonus}`,
  };
}

export function activeRequests(service: ServiceMissionState): PassengerState[] {
  return Object.values(service.passengers)
    .filter((passenger) => passenger.requestStatus === 'active')
    .sort((first, second) => first.patience - second.patience);
}

export function needLabel(need: ServiceNeed): string {
  if (need === 'drink') return 'a drink';
  if (need === 'meal') return 'a meal tray';
  return 'medical help';
}

function passengerFromDefinition(definition: PassengerDefinition): PassengerState {
  return {
    ...definition,
    seatPosition: { ...definition.seatPosition },
    servicePosition: { ...definition.servicePosition },
    requestStatus: definition.requestAt === 0 ? 'active' : 'pending',
    patience: 1,
    panic: 0,
    injury: definition.need === 'medical' ? 0.38 : 0,
    satisfaction: 0.5,
  };
}

function initialCartStock(): Record<ServiceNeed, number> {
  const stock: Record<ServiceNeed, number> = { drink: 0, meal: 0, medical: 0 };
  for (const object of serviceSliceDefinition.objects) {
    if ('serviceNeed' in object) stock[object.serviceNeed] += 1;
  }
  return stock;
}

function terminalOutcome(
  flight: FlightState,
  elapsed: number,
  duration: number,
  served: number,
  missed: number,
): ServiceMissionState['outcome'] {
  if (flight.phase === 'crashed') return 'failed';
  if (flight.phase === 'landed') return served >= 3 && missed <= 3 ? 'success' : 'failed';
  if (elapsed >= duration) return served >= 5 && missed <= 2 ? 'success' : 'failed';
  return 'active';
}
