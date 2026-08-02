import type { MissionState, PassengerRequestStatus, PassengerState } from '../sim/types';

export interface DebriefReview {
  passengerId: string;
  name: string;
  status: PassengerRequestStatus;
  stars: number;
  quote: string;
}

export interface DebriefSystemResult {
  label: string;
  result: string;
  detail: string;
  tone: 'good' | 'neutral' | 'bad';
}

export interface DebriefViewModel {
  outcome: 'success' | 'failed';
  outcomeLabel: string;
  title: string;
  verdict: string;
  score: number;
  served: number;
  missed: number;
  fire: DebriefSystemResult;
  repair: DebriefSystemResult;
  reviews: DebriefReview[];
}

const statusPriority: Record<PassengerRequestStatus, number> = {
  missed: 0,
  active: 1,
  pending: 2,
  served: 3,
};

const servedQuotes = [
  'My order arrived before my existential crisis. Five stars.',
  'The crew moved like professionals who had misplaced the manual.',
  'Service with a smile. The smile looked court ordered, but still.',
  'I received exactly what I asked for. Suspiciously competent.',
];

const missedQuotes = [
  'I pressed the call button. It developed abandonment issues.',
  'My snack is now classified as missing baggage.',
  'The crew flew past me at aisle speed. Impressive, technically.',
  'Zero refreshments. Unlimited character development.',
];

const unresolvedQuotes = [
  'We landed before anyone acknowledged the blinking button.',
  'Request pending. Apparently the runway had priority.',
  'The seatbelt sign understood me better than the crew.',
  'I am still waiting, but now I am waiting on the ground.',
];

export function buildDebrief(state: MissionState): DebriefViewModel | undefined {
  if (state.service.outcome === 'active') return undefined;
  const outcome = state.service.outcome;
  const passengers = Object.values(state.service.passengers)
    .sort(
      (left, right) =>
        statusPriority[left.requestStatus] - statusPriority[right.requestStatus] ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 4);

  return {
    outcome,
    outcomeLabel: outcome === 'success' ? 'SHIFT CLEARED' : 'SHIFT LOST',
    title: outcome === 'success' ? 'You landed the punchline.' : 'You landed. The dignity did not.',
    verdict: verdictFor(state),
    score: state.service.score,
    served: state.service.served,
    missed: state.service.missed,
    fire: fireResult(state),
    repair: repairResult(state),
    reviews: passengers.map(reviewFor),
  };
}

function verdictFor(state: MissionState): string {
  if (state.service.outcome === 'success') {
    if (state.service.score >= 500) return 'THE CABIN CLAPPED. LEGALLY, THAT COUNTS AS A PARADE.';
    if (state.fire.status === 'suppressed' && state.repair.status === 'fixed')
      return 'BUDGET AIRLINE OF THE MINUTE. ALL APPLIANCES DEFEATED.';
    return 'MOST DIGNITY ARRIVED IN THE SAME AIRPORT.';
  }
  if (state.fire.status === 'active') return 'ONE STAR. THE STAR WAS ALSO ON FIRE.';
  if (state.service.missed >= 4) return 'THE CALL BUTTONS HAVE FORMED A UNION.';
  return 'CUSTOMER SERVICE HAS LEFT THE AIRSPACE.';
}

function fireResult(state: MissionState): DebriefSystemResult {
  if (state.fire.status === 'suppressed')
    return {
      label: 'GALLEY FIRE',
      result: 'SUPPRESSED',
      detail: 'Foam deployed. Insurance remains emotionally unavailable.',
      tone: 'good',
    };
  if (state.fire.status === 'active')
    return {
      label: 'GALLEY FIRE',
      result: 'STILL BURNING',
      detail: 'The smoke detector has requested a transfer.',
      tone: 'bad',
    };
  return {
    label: 'GALLEY FIRE',
    result: 'NO INCIDENT',
    detail: 'The galley behaved. Investigators remain suspicious.',
    tone: 'neutral',
  };
}

function repairResult(state: MissionState): DebriefSystemResult {
  if (state.repair.status === 'fixed')
    return {
      label: 'COFFEE MUTINY',
      result: 'DEFEATED',
      detail: 'The breaker won. Coffee democracy has been postponed.',
      tone: 'good',
    };
  if (state.repair.status === 'active' || state.repair.status === 'repairing')
    return {
      label: 'COFFEE MUTINY',
      result: 'UNRESOLVED',
      detail: 'The machine now controls beverage policy.',
      tone: 'bad',
    };
  return {
    label: 'COFFEE MUTINY',
    result: 'NO INCIDENT',
    detail: 'The machine stayed quiet. Probably plotting.',
    tone: 'neutral',
  };
}

function reviewFor(passenger: PassengerState): DebriefReview {
  const index = stableIndex(passenger.id);
  const served = passenger.requestStatus === 'served';
  const missed = passenger.requestStatus === 'missed';
  const quotes = served ? servedQuotes : missed ? missedQuotes : unresolvedQuotes;
  return {
    passengerId: passenger.id,
    name: passenger.name,
    status: passenger.requestStatus,
    stars: served ? Math.max(4, Math.round(passenger.satisfaction * 5)) : missed ? 1 : 2,
    quote: quotes[index % quotes.length] ?? quotes[0]!,
  };
}

function stableIndex(value: string): number {
  let total = 0;
  for (const character of value) total = (total * 31 + character.charCodeAt(0)) >>> 0;
  return total;
}
