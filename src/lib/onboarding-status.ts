export function resolveOnboardingStatus(
  organizer: { role: "owner" | "admin"; onboardingCompletedAt?: number } | null,
  accessibleEventCount: number,
): "incomplete" | "complete" {
  if (organizer) {
    // The wizard bootstraps an organization owner and its first event. Admins are
    // invited into an existing organization and must never be routed through it.
    return organizer.role === "admin" || organizer.onboardingCompletedAt
      ? "complete"
      : "incomplete";
  }
  return accessibleEventCount > 0 ? "complete" : "incomplete";
}
