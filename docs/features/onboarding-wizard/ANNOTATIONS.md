# Onboarding Browser Annotations — 2026-08-12

Implementation is owned by the other onboarding agent. Verify all three items before handoff:

1. Completion must persist. After completing or skipping onboarding, revisiting `/onboarding`
   or reopening the app must route into the product without rendering the wizard again. The
   organizer's persisted `onboardingCompletedAt` field should remain authoritative; a user-scoped
   browser fast-path is acceptable if it improves startup resilience.
2. The onboarding experience must be centered horizontally and vertically in the viewport at
   desktop sizes, while remaining naturally scrollable on shorter and mobile viewports.
3. Redesign the current sparse step rail + small card into a polished Namos-style onboarding
   experience. Preserve the real four-step workflow, optional email/import steps, keyboard/focus
   behavior, and the existing no-border/no-shadow/coral-accent product vocabulary.

Regression checks:

- A signed-in speaker visiting `/portal/*` must never be sent through organizer onboarding.
- A completed organizer who manually enters `/onboarding` must be redirected away.
- Test centered desktop layout and a 375px-wide mobile layout.
