export const MANAGED_AI_DISABLED_ERROR = "MANAGED_AI_DISABLED";

export const MANAGED_AI_DISABLED_MESSAGE =
  "Managed AI is temporarily disabled. Bring your own key in Settings, or contact support.";

// Convex environment variables are strings. Deliberately treat every non-empty value as on so
// operators can use MANAGED_AI_DISABLED=1, true, or an incident identifier without a code deploy.
export function isManagedAiDisabled() {
  return Boolean(process.env.MANAGED_AI_DISABLED);
}
