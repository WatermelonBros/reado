/**
 * Trigger for the first-run onboarding tour. The tour itself auto-starts once
 * (localStorage gate); this store lets Settings replay it on demand.
 */
import { create } from "zustand";

interface TourGuideState {
  /** Bumped to (re)start the tour; OnboardingTour watches it. */
  runNonce: number;
  run: () => void;
}

export const useTourGuide = create<TourGuideState>((set) => ({
  runNonce: 0,
  run: () => set((s) => ({ runNonce: s.runNonce + 1 })),
}));
