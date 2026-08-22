// In this deployment's Convex client, `error.message` on a thrown server error is ALWAYS just
// the generic request framing — "[Request ID: kx7...] Server Error" — with no envelope to strip
// and no actual message text on it at all, for either a plain Error or a ConvexError. (An older
// version of this comment claimed the real message rode along on `.message` as "Uncaught Error:
// <message>\n    at handler (...)"; that was never actually true against this client version —
// verified live against a real production request. The regex below is kept only as a defensive
// fallback in case some other Convex client build does emit that shape.) The one channel that
// reliably carries the real message is `ConvexError#data`: convex/functions.ts's `mutation`/
// `query` wrappers re-raise every plain Error a handler throws as `new ConvexError(cause.message)`
// specifically so a bare string ends up on `.data` — check that first. The request id and stack
// frame are debugging noise, not something an organizer should ever see in an inline form error.
// See also `isForbiddenError` in `authorization.ts`, which documents the same wrapping for a
// different purpose.
const CONVEX_ERROR_ENVELOPE = /(?:Uncaught (?:Convex)?Error:\s*)+([\s\S]*?)\s*(?:\n\s*at\s|$)/;

export function cleanErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if ("data" in error && typeof (error as { data?: unknown }).data === "string") {
    const data = ((error as { data: string }).data).trim();
    if (data) return data;
  }
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

function isDemoReadOnly(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Same "the real payload lives on `.data`, not `.message`" story as cleanErrorMessage above:
  // the demo-read-only guard throws `new ConvexError({ code: "demo_read_only", ... })`, an
  // object, not a string, so it never took the string-`.data` fast path there. Check both
  // `.data` (object form) and `.message` (defensive fallback) for the marker.
  const data = (error as { data?: unknown }).data;
  if (data && typeof data === "object" && "code" in data && data.code === "demo_read_only") return true;
  return error.message.includes("demo_read_only");
}

export function friendlyErrorMessage(error: unknown, fallback: string): string {
  console.error(error);
  if (isDemoReadOnly(error)) return "This is a read-only demo.";
  const message = cleanErrorMessage(error, fallback);
  if (!message || message.length > 160 || LOOKS_TECHNICAL.test(message)) return fallback;
  return message;
}
