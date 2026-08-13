// Convex throws "Forbidden: organizer access required." from assertOrganizer, and the client
// surfaces it wrapped in its own request framing ("[Request ID: …] Server Error\nUncaught
// Error: Forbidden: …"). A surface that has a legitimate reduced view for non-organizers uses
// this to fall back to that view instead of showing the failure as a page error.
export function isForbiddenError(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  return /forbidden/i.test(message);
}
