import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Bookmark,
  BookmarkCheck,
  CalendarPlus,
  Clock3,
  ExternalLink,
  MapPin,
  Search,
  Users,
  X,
} from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRepo } from "@/data/repo";
import type {
  PublicEmbed,
  PublicEmbedAgendaItem,
  PublicEmbedSpeaker,
} from "@/data/types";
import {
  attendeeScheduleStorageKey,
  attendeeSessionState,
  googleCalendarUrl,
  sessionMatchesSearch,
} from "@/lib/attendee-site";
import { agendaDayTrackGroups } from "@/lib/public-embed";
import { richTextToPlainText } from "@/lib/rich-text";

function time(value: number, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(value);
}

function dateRange(embed: PublicEmbed) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: embed.eventTimezone,
  });
  const start = formatter.format(embed.eventStartDate);
  const end = formatter.format(embed.eventEndDate);
  return start === end ? start : `${start} – ${end}`;
}

function updatedAt(embed: PublicEmbed) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: embed.eventTimezone,
    timeZoneName: "short",
  }).format(embed.lastUpdatedAt);
}

function initials(name: string) {
  return name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
}

function SessionState({ state }: { state?: "now" | "up-next" }) {
  if (!state) return null;
  return (
    <span className={state === "now"
      ? "rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success"
      : "rounded-full bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground"}
    >
      {state === "now" ? "Now" : "Up next"}
    </span>
  );
}

function SaveButton({
  saved,
  onToggle,
  compact = false,
}: {
  saved: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <Button
      type="button"
      size="sm"
      variant={saved ? "accent" : "ghost"}
      aria-pressed={saved}
      aria-label={saved ? "Remove from my schedule" : "Save to my schedule"}
      onClick={event => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Icon className="mr-1.5 h-4 w-4" />
      {compact ? (saved ? "Saved" : "Save") : (saved ? "Saved to my schedule" : "Save to my schedule")}
    </Button>
  );
}

function SessionCard({
  item,
  embed,
  state,
  saved,
  onOpen,
  onToggleSaved,
}: {
  item: PublicEmbedAgendaItem;
  embed: PublicEmbed;
  state?: "now" | "up-next";
  saved: boolean;
  onOpen: () => void;
  onToggleSaved: () => void;
}) {
  return (
    <article className={cardSurfaceClasses("default", "p-4 sm:p-5")}>
      <div className="flex items-start gap-4">
        <Button type="button" variant="ghost" onClick={onOpen} className="h-auto min-w-0 flex-1 justify-start p-0 text-left font-normal hover:bg-transparent">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="tabular-nums">{time(item.startTime, embed.eventTimezone)} – {time(item.endTime, embed.eventTimezone)}</span>
              <SessionState state={state} />
            </div>
            <h3 className="mt-2 text-base font-semibold leading-6 text-balance">{item.title}</h3>
            {item.speakers.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{item.speakers.map((speaker) => speaker.name).join(", ")}</p>}
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{item.roomName}</span>
              {item.trackName && <span>{item.trackName}</span>}
            </p>
          </div>
        </Button>
        <SaveButton saved={saved} onToggle={onToggleSaved} compact />
      </div>
    </article>
  );
}

function SessionDetail({
  item,
  embed,
  saved,
  onClose,
  onToggleSaved,
}: {
  item: PublicEmbedAgendaItem;
  embed: PublicEmbed;
  saved: boolean;
  onClose: () => void;
  onToggleSaved: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus({ preventScroll: false });
  }, [item.sessionKey]);

  return (
    <aside ref={panel} tabIndex={-1} aria-label={`Session details: ${item.title}`} className={cardSurfaceClasses("muted", "order-first w-full shrink-0 p-5 outline-none lg:order-last lg:w-[340px]")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">Session details</p>
          <h2 className="mt-1 text-xl font-semibold text-balance">{item.title}</h2>
        </div>
        <Button type="button" size="icon" variant="ghost" aria-label="Close session details" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-5 space-y-3 text-sm">
        <p className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>{time(item.startTime, embed.eventTimezone)} – {time(item.endTime, embed.eventTimezone)}</span></p>
        <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>{[item.roomName, item.locationDetails, embed.eventLocation].filter(Boolean).join(" · ")}</span></p>
        {item.trackName && <p className="text-muted-foreground">Track: <span className="text-foreground">{item.trackName}</span></p>}
      </div>

      {item.description && <p className="mt-5 text-sm leading-6 text-muted-foreground text-pretty">{richTextToPlainText(item.description)}</p>}

      {item.speakers.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4 text-muted-foreground" />Speakers</p>
          <div className="flex flex-wrap gap-2">
            {item.speakers.map(speaker => <a key={speaker.speakerKey} href={`#${speaker.speakerKey}`} className="rounded-full bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent">{speaker.name}</a>)}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-col items-stretch gap-2">
        {item.recording && <Button asChild size="sm"><a href={item.recording.url} target="_blank" rel="noreferrer">Watch recording<span className="sr-only"> (opens in a new tab)</span></a></Button>}
        <SaveButton saved={saved} onToggle={onToggleSaved} />
        <Button asChild size="sm" variant="outline">
          <a href={googleCalendarUrl(item, embed.eventName, embed.eventLocation)} target="_blank" rel="noreferrer">
            <CalendarPlus className="mr-1.5 h-4 w-4" />Add to Google Calendar<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </Button>
      </div>
    </aside>
  );
}

function SpeakerCard({ speaker }: { speaker: PublicEmbedSpeaker }) {
  return (
    <article id={speaker.speakerKey} className={cardSurfaceClasses("default", "scroll-mt-6 p-5")}>
      <div className="flex items-center gap-3">
        {speaker.headshotUrl
          ? <img src={speaker.headshotUrl} alt={`${speaker.name}'s headshot`} className="h-14 w-14 rounded-full object-cover" />
          : <div aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">{initials(speaker.name)}</div>}
        <h3 className="text-base font-semibold">{speaker.name}</h3>
      </div>
      {speaker.bio && <p className="mt-4 text-sm leading-6 text-muted-foreground text-pretty">{richTextToPlainText(speaker.bio)}</p>}
      {speaker.links.length > 0 && (
        <nav aria-label={`${speaker.name}'s links`} className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {speaker.links.map(link => <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-muted-foreground">{link.label}<ExternalLink className="h-3.5 w-3.5" /><span className="sr-only"> (opens in a new tab)</span></a>)}
        </nav>
      )}
    </article>
  );
}

function AttendeeContent({ embed, eventSlug }: { embed: PublicEmbed; eventSlug: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [track, setTrack] = useState("all");
  const [room, setRoom] = useState("all");
  const [day, setDay] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(attendeeScheduleStorageKey(eventSlug)) ?? "[]");
      setSaved(new Set(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : []));
    } catch {
      setSaved(new Set());
    }
  }, [eventSlug]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const days = useMemo(() => agendaDayTrackGroups(embed), [embed]);
  const currentDayLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: embed.eventTimezone }).format(now);
  const selectedSession = embed.agenda.find(item => item.sessionKey === searchParams.get("session"));
  const selectedSessionDay = selectedSession
    ? days.find(candidate => candidate.tracks.some(group => group.items.some(item => item.sessionKey === selectedSession.sessionKey)))?.label
    : undefined;
  const selectedDay = selectedSessionDay || day || days.find(candidate => candidate.label === currentDayLabel)?.label || days[0]?.label || "";
  const nextSessionKey = embed.agenda.find(item => item.startTime > now)?.sessionKey;

  const matchingAgenda = embed.agenda.filter(item =>
    sessionMatchesSearch(item, search)
    && (track === "all" || (item.trackName ?? "Uncategorized") === track)
    && (room === "all" || item.roomName === room)
    && (!savedOnly || saved.has(item.sessionKey)),
  );
  const visibleDay = agendaDayTrackGroups({ ...embed, agenda: matchingAgenda }).find(candidate => candidate.label === selectedDay);
  const visibleCount = visibleDay?.tracks.reduce((count, group) => count + group.items.length, 0) ?? 0;

  function openSession(sessionKey?: string) {
    const next = new URLSearchParams(searchParams);
    if (sessionKey) next.set("session", sessionKey);
    else next.delete("session");
    setSearchParams(next);
  }

  function toggleSaved(sessionKey: string) {
    setSaved(current => {
      const next = new Set(current);
      if (next.has(sessionKey)) next.delete(sessionKey);
      else next.add(sessionKey);
      try {
        localStorage.setItem(attendeeScheduleStorageKey(eventSlug), JSON.stringify([...next]));
      } catch {
        // The schedule still works for this page view when storage is unavailable.
      }
      return next;
    });
  }

  const savedCount = embed.agenda.filter(item => saved.has(item.sessionKey)).length;

  return (
    <PublicLayout>
      <header className={cardSurfaceClasses("muted", "p-5 sm:p-6")}>
        <div className="flex items-start gap-4">
          {embed.eventLogoUrl && <img src={embed.eventLogoUrl} alt={`${embed.eventName} logo`} className="h-14 w-14 rounded-lg object-contain sm:h-16 sm:w-16" />}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-balance">{embed.eventName}</h1>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{dateRange(embed)}</span>
              {embed.eventLocation && <span>{embed.eventLocation}</span>}
              <span>{embed.eventTimezone}</span>
            </p>
            {embed.eventDescription && <p className="mt-3 max-w-[70ch] text-sm leading-6 text-muted-foreground text-pretty">{embed.eventDescription}</p>}
          </div>
        </div>
      </header>

      {days.length > 1 && (
        <nav aria-label="Conference days" className="flex gap-2 overflow-x-auto pb-1">
          {days.map(candidate => (
            <Button key={candidate.label} type="button" variant={candidate.label === selectedDay ? "default" : "outline"} aria-current={candidate.label === selectedDay ? "date" : undefined} onClick={() => setDay(candidate.label)} className="shrink-0">
              {candidate.label}
            </Button>
          ))}
        </nav>
      )}

      <section aria-label="Schedule controls" className={cardSurfaceClasses("default", "p-4")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={event => setSearch(event.target.value)} aria-label="Search sessions and speakers" placeholder="Search sessions or speakers" className="bg-muted/60 pl-9" />
          </div>
          <Select value={track} onValueChange={setTrack}>
            <SelectTrigger aria-label="Filter by track" className="bg-muted/60"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All tracks</SelectItem>{embed.trackNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={room} onValueChange={setRoom}>
            <SelectTrigger aria-label="Filter by room" className="bg-muted/60"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All rooms</SelectItem>{embed.roomNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="button" variant={savedOnly ? "accent" : "outline"} size="sm" aria-pressed={savedOnly} onClick={() => setSavedOnly(value => !value)}>
            <BookmarkCheck className="mr-1.5 h-4 w-4" />My schedule ({savedCount})
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">{visibleCount} {visibleCount === 1 ? "session" : "sessions"} shown</p>
      </section>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <section id="schedule" aria-label="Conference schedule" className="min-w-0 flex-1 space-y-6">
          {!visibleDay || visibleCount === 0 ? (
            <EmptyState compact className={cardSurfaceClasses()} message={savedOnly && savedCount === 0 ? "Save a session to build your personal schedule." : "No sessions match these filters."} />
          ) : visibleDay.tracks.map(({ track: trackName, items }) => (
            <section key={trackName} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">{trackName}</h2>
                <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? "session" : "sessions"}</span>
              </div>
              {items.map(item => <SessionCard key={item.sessionKey} item={item} embed={embed} state={attendeeSessionState(item, now, nextSessionKey)} saved={saved.has(item.sessionKey)} onOpen={() => openSession(item.sessionKey)} onToggleSaved={() => toggleSaved(item.sessionKey)} />)}
            </section>
          ))}
        </section>
        {selectedSession && <SessionDetail item={selectedSession} embed={embed} saved={saved.has(selectedSession.sessionKey)} onClose={() => openSession()} onToggleSaved={() => toggleSaved(selectedSession.sessionKey)} />}
      </div>

      {embed.speakers.length > 0 && (
        <section id="speakers" aria-labelledby="speakers-heading" className="space-y-4">
          <div>
            <h2 id="speakers-heading" className="text-xl font-semibold">Speakers</h2>
            <p className="mt-1 text-sm text-muted-foreground">Meet the people behind the program.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">{embed.speakers.map(speaker => <SpeakerCard key={speaker.speakerKey} speaker={speaker} />)}</div>
        </section>
      )}

      <footer className="space-y-2 text-center text-xs text-muted-foreground">
        <p>Schedule last updated {updatedAt(embed)}</p>
        {embed.eventWebsiteUrl && <p><a href={embed.eventWebsiteUrl} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:text-muted-foreground">Event website<span className="sr-only"> (opens in a new tab)</span></a></p>}
        <p>Powered by Namos Sessions</p>
      </footer>
    </PublicLayout>
  );
}

export default function AttendeeSite() {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  const repo = useRepo();
  const [result, setResult] = useState<{ eventSlug: string; embed: PublicEmbed | null }>();
  const [error, setError] = useState<{ eventSlug: string; message: string }>();

  useEffect(() => {
    let active = true;
    if (!eventSlug) return;
    setResult(undefined);
    setError(undefined);
    repo.publicEmbeds.getLegacy(eventSlug)
      .then(value => { if (active) setResult({ eventSlug, embed: value }); })
      .catch(cause => { if (active) setError({ eventSlug, message: cause instanceof Error ? cause.message : "Could not load this event." }); });
    return () => { active = false; };
  }, [eventSlug, repo]);

  if (error?.eventSlug === eventSlug) return <PublicLayout><p role="alert" className="text-sm text-destructive">{error.message}</p></PublicLayout>;
  if (!eventSlug || result?.eventSlug !== eventSlug) return <PublicLayout><SkeletonList rows={5} label="Loading event…" /></PublicLayout>;
  if (!result.embed) return <PublicLayout><main className={cardSurfaceClasses("default", "p-6")}><h1 className="text-xl font-semibold">Event not found</h1><p className="mt-2 text-sm text-muted-foreground">This attendee site is not published or does not exist.</p></main></PublicLayout>;
  return <AttendeeContent key={eventSlug} embed={result.embed} eventSlug={eventSlug} />;
}
