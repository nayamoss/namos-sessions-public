const PLACEHOLDER_KEY_PATTERN = /placeholder|replace[-_ ]?me|local[-_ ]?dev|example/i;

/** Reject checked-in development placeholders before they can queue a paid AI run. */
export function hasUsableManagedOpenAiKey(value: string | undefined) {
  const key = value?.trim();
  return Boolean(key && !PLACEHOLDER_KEY_PATTERN.test(key));
}
