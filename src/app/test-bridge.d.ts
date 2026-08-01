import type { MissionState } from '../sim/types';

declare global {
  interface Window {
    __CABIN_MAYHEM_TEST__?: {
      start(): void;
      state(): MissionState | undefined;
      step(seconds: number): void;
      advancePhase(): void;
      trigger(kind: 'turbulence' | 'air-pocket' | 'sharp-turn' | 'collision'): void;
      reset(): void;
    };
  }
}

export {};
