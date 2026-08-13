/**
 * Carries the speaker a public submission just resolved to across the redirect
 * into /portal, so the speaker is not asked to pick themselves out of a
 * dropdown of every speaker at the event.
 *
 * sessionStorage, not localStorage: this is a one-hop handoff, not an identity.
 * It must not survive the browser session, and it is not an auth boundary —
 * the portal still only accepts an id that is in the event's speaker list.
 */
const key = "sessionboard:portal-handoff-speaker";

export function storePortalHandoffSpeaker(speakerId: string) {
  if (!speakerId) return;
  window.sessionStorage.setItem(key, speakerId);
}

/**
 * Reads and clears in one step. Consuming once means a later manual change of
 * the dropdown is never silently re-hijacked by a stale handoff on reload.
 */
export function consumePortalHandoffSpeaker(): string | undefined {
  const id = window.sessionStorage.getItem(key) ?? undefined;
  window.sessionStorage.removeItem(key);
  return id || undefined;
}
