import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TOUR_STEPS } from "@/lib/tourSteps";

type OnboardingTourState = {
  hasTakenTour: boolean;
  isTourActive: boolean;
  tourStep: number;
  startTour: () => void;
  endTour: () => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  resetTour: () => void;
};

export const useOnboardingTourStore = create<OnboardingTourState>()(
  persist(
    (set) => ({
      hasTakenTour: false,
      isTourActive: false,
      tourStep: 0,
      startTour: () => set({ isTourActive: true, tourStep: 0 }),
      endTour: () => set({ hasTakenTour: true, isTourActive: false, tourStep: 0 }),
      nextTourStep: () => set((state) => (
        state.tourStep >= TOUR_STEPS.length - 1
          ? { hasTakenTour: true, isTourActive: false, tourStep: 0 }
          : { tourStep: state.tourStep + 1 }
      )),
      prevTourStep: () => set((state) => ({ tourStep: Math.max(0, state.tourStep - 1) })),
      resetTour: () => set({ hasTakenTour: false, isTourActive: false, tourStep: 0 }),
    }),
    {
      name: "namos-onboarding-tour",
      partialize: (state) => ({ hasTakenTour: state.hasTakenTour }),
    },
  ),
);
