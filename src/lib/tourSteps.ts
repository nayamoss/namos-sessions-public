export const TOUR_STEPS = [
  {
    id: "dashboard",
    targetSelector: '[data-tour="tour-dashboard"]',
    headline: "Your event dashboard",
    body: "Start here for a quick view of your event and the work that needs attention.",
    placement: "right",
  },
  {
    id: "program",
    targetSelector: '[data-tour="tour-program"]',
    headline: "Build your program",
    body: "Manage submissions, speakers, schedules, and communications from these sections.",
    placement: "right",
  },
  {
    id: "settings",
    targetSelector: '[data-tour="tour-settings"]',
    headline: "Event settings",
    body: "Update event details and configure your workspace whenever you need to.",
    placement: "right",
  },
  {
    id: "portal",
    targetSelector: '[data-tour="tour-portal"]',
    headline: "Speaker portal",
    body: "Switch to the speaker experience to see the information and tasks your speakers receive.",
    placement: "left",
  },
] as const;

export type TourStep = (typeof TOUR_STEPS)[number];
