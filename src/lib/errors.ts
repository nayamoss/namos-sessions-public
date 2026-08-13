// Convex wraps every thrown server error in its own request framing before it reaches the
// browser: "[Request ID: kx7...] Server Error\nUncaught Error: <actual message>\n    at handler
// (../convex/sponsorTiers.ts:136:8)". The message we actually want to show a user is just
// <actual message> — the request id and stack frame are debugging noise, not something an
// organizer should ever see in an inline form error. See also `isForbiddenError` in
// `authorization.ts`, which documents the same wrapping for a different purpose.
const CONVEX_ERROR_ENVELOPE = /Uncaught Error:\s*([\s\S]*?)\s*(?:\n\s*at\s|$)/;

export function cleanErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const match = CONVEX_ERROR_ENVELOPE.exec(error.message);
  const message = (match?.[1] ?? error.message).trim();
  return message || fallback;
}
