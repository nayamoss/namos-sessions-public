// Convex wraps every thrown server error in its own request framing before it reaches the
// browser: "[Request ID: kx7...] Server Error\nUncaught Error: <actual message>\n    at handler
// (../convex/sponsorTiers.ts:136:8)". The message we actually want to show a user is just
// <actual message> — the request id and stack frame are debugging noise, not something an
// organizer should ever see in an inline form error. See also `isForbiddenError` in
// `authorization.ts`, which documents the same wrapping for a different purpose.
const CONVEX_ERROR_ENVELOPE = /(?:Uncaught Error:\s*)+([\s\S]*?)\s*(?:\n\s*at\s|$)/;

export function cleanErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const match = CONVEX_ERROR_ENVELOPE.exec(error.message);
  const message = (match?.[1] ?? error.message).trim();
  return message || fallback;
}

// Some failures never go through the "Uncaught Error: ..." envelope above — e.g. a raw
// OIDC/auth-provider rejection from Convex's HTTP layer arrives as a bare JSON blob
// (`{"code":"NoAuthProvider","message":"..."}`), and a network failure can surface a stack
// trace. None of that is something an end user should ever see verbatim during onboarding.
// This always logs the real cause to the console for debugging, then returns the cleaned
// message only if it reads like normal prose; anything that looks technical (JSON, stack
// frames, error codes) falls back to a plain-language message instead.
const LOOKS_TECHNICAL = /^\s*[{[]|Uncaught|NoAuthProvider|ConvexError|\bat\s+\S+\s*\(|\.(ts|tsx|js|ts:)\d*:\d+|^\s*[A-Za-z]+Error:/;

export function friendlyErrorMessage(error: unknown, fallback: string): string {
  console.error(error);
  const message = cleanErrorMessage(error, fallback);
  if (!message || message.length > 160 || LOOKS_TECHNICAL.test(message)) return fallback;
  return message;
}
