import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRepo } from "@/data/repo";
import type { Event, EventId, Speaker } from "@/data/types";
import { consumePortalHandoffSpeaker } from "@/lib/portal-handoff";

type PortalIdentity = {
  eventId?: EventId;
  eventName?: string;
  event?: Event;
  selectedSpeaker?: Speaker;
  loading: boolean;
  error?: string;
  /**
   * True once the signed-in Clerk account resolved to a speaker by email. When this is false,
   * the account has no linked speaker record and PortalLayout shows a "no speaker profile
   * found" notice instead of granting access to any speaker's data.
   */
  identityLockedByClerk: boolean;
  /** A public-submit handoff named a different speaker than the verified Clerk session. */
  handoffMismatch: boolean;
};

const PortalIdentityContext = createContext<PortalIdentity | null>(null);

function storageKey(eventId: EventId) { return `sessionboard:portal-speaker:${eventId}`; }

export function PortalIdentityProvider({ children }: { children: ReactNode }) {
  const repo = useRepo();
  const [eventId, setEventId] = useState<EventId>();
  const [eventName, setEventName] = useState<string>();
  const [eventData, setEventData] = useState<Event>();
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [identityLockedByClerk, setIdentityLockedByClerk] = useState(false);
  const [handoffMismatch, setHandoffMismatch] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(undefined);
      try {
        const event = (await repo.events.listForPortal())[0];
        if (!event) {
          if (active) { setEventId(undefined); setEventName(undefined); setEventData(undefined); setSpeakers([]); setSelectedSpeakerId(undefined); setHandoffMismatch(false); }
          return;
        }
        const ownSpeaker = await repo.speakers.getMine({ eventId: event.id });
        // A matched Clerk account sees only its own speaker record. Accounts without a
        // matching speaker record get no speaker data at all — see PortalLayout's
        // "no speaker profile found" notice. `speakers.list` is organizer/event-member
        // scoped on the backend, so an unmatched account can only ever resolve the
        // one-hop handoff below, never browse the full roster.
        const eventSpeakers = ownSpeaker ? [ownSpeaker] : await repo.speakers.list({ eventId: event.id }).catch(() => []);
        // A speaker arriving straight from a submission carries their own id across
        // the redirect. Prefer it over the stored selection, but only if it is
        // genuinely one of this event's speakers — the handoff is a convenience,
        // not a credential.
        const handoffId = consumePortalHandoffSpeaker();
        const resolvedHandoffId = handoffId && eventSpeakers.some(speaker => speaker.id === handoffId) ? handoffId : undefined;
        // Promote it to the durable selection so a reload of the portal keeps them
        // on their own record rather than dropping back to "choose a speaker".
        if (resolvedHandoffId) window.localStorage.setItem(storageKey(event.id), resolvedHandoffId);
        const storedId = window.localStorage.getItem(storageKey(event.id));
        if (active) {
          setEventId(event.id);
          setEventName(event.name);
          setEventData(event);
          setSpeakers(eventSpeakers);
          setSelectedSpeakerId(ownSpeaker?.id ?? resolvedHandoffId ?? (storedId && eventSpeakers.some(speaker => speaker.id === storedId) ? storedId : undefined));
          setIdentityLockedByClerk(!!ownSpeaker);
          // Clerk identity remains authoritative. The handoff is only a post-submit convenience,
          // but silently discarding it made a stale session indistinguishable from a routing bug.
          setHandoffMismatch(Boolean(ownSpeaker && handoffId && handoffId !== ownSpeaker.id));
        }
      } catch (cause) {
        if (active) { setEventId(undefined); setEventName(undefined); setEventData(undefined); setSpeakers([]); setSelectedSpeakerId(undefined); setHandoffMismatch(false); setError(cause instanceof Error ? cause.message : "Could not load portal speaker access."); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [repo]);

  const selectedSpeaker = speakers.find(speaker => speaker.id === selectedSpeakerId);
  return <PortalIdentityContext.Provider value={{ eventId, eventName, event: eventData, selectedSpeaker, loading, error, identityLockedByClerk, handoffMismatch }}>{children}</PortalIdentityContext.Provider>;
}

export function usePortalIdentity() {
  const identity = useContext(PortalIdentityContext);
  if (!identity) throw new Error("Portal identity provider is missing");
  return identity;
}
