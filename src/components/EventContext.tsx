import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Link, useParams } from "react-router-dom";
import { useRepo } from "@/data/repo";
import type { Event } from "@/data/types";

type CurrentEvent = { event: Event };
const EventContext = createContext<CurrentEvent | null>(null);

// Remembers the last event a user actually visited, so signing back in drops
// them straight into that event's dashboard instead of always stopping at the
// bare events list — read by EventsEntry (App.tsx) on the next sign-in.
export const LAST_EVENT_SLUG_KEY = "namos-last-event-slug";

export function getLastVisitedEventSlug(): string | null {
  try {
    return window.localStorage.getItem(LAST_EVENT_SLUG_KEY);
  } catch {
    return null;
  }
}

function rememberVisitedEvent(slug: string) {
  try {
    window.localStorage.setItem(LAST_EVENT_SLUG_KEY, slug);
  } catch {
    // Best-effort — sign-in just falls back to the events list.
  }
}

export function EventProvider({ children }: { children: ReactNode }) {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  const repo = useRepo();
  const [event, setEvent] = useState<Event>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    setEvent(undefined);
    if (!eventSlug) {
      setLoading(false);
      setError("Event not found.");
      return () => {
        cancelled = true;
      };
    }
    void repo.events
      .getBySlug(eventSlug)
      .then((nextEvent) => {
        if (cancelled) return;
        if (!nextEvent) setError("Event not found.");
        else {
          setEvent(nextEvent);
          rememberVisitedEvent(nextEvent.slug);
        }
      })
      .catch((cause) => {
        if (!cancelled)
          setError(
            cause instanceof Error && cause.message.includes("Forbidden")
              ? "You don't have access to this event."
              : "Event not found, or you don't have access.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventSlug, repo]);

  if (loading)
    return <p className="p-6 text-sm text-muted-foreground">Loading event…</p>;
  if (!event)
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 px-6">
        <h1 className="text-xl font-semibold">Event unavailable</h1>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Link
          className="text-sm font-medium text-primary hover:underline"
          to="/events"
        >
          Back to events
        </Link>
      </main>
    );
  return (
    <EventContext.Provider value={{ event }}>{children}</EventContext.Provider>
  );
}

export function useCurrentEvent(): CurrentEvent {
  const value = useContext(EventContext);
  const repo = useRepo();
  const [fallback, setFallback] = useState<Event>();
  useEffect(() => {
    // A small compatibility path remains for legacy component tests that render pages in
    // isolation. Production code must always be under EventProvider; otherwise fail fast
    // instead of silently resurrecting the old "first event" behavior.
    if (value || import.meta.env.MODE !== "test") return;
    let cancelled = false;
    void repo.events
      .list()
      .then((events) => {
        if (!cancelled) setFallback(events.at(0));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [repo, value]);
  if (value) return value;
  if (import.meta.env.MODE !== "test")
    throw new Error("useCurrentEvent must be used within EventProvider.");
  return { event: fallback as Event };
}

export function useOptionalCurrentEvent(): CurrentEvent | null {
  return useContext(EventContext);
}
