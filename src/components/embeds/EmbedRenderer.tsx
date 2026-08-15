import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChevronDown, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PublicEmbedSession, PublicEmbedView } from "@/data/types";

function formatTime(value: number | undefined, embed: PublicEmbedView) {
  if (value === undefined) return "";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: embed.event.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: embed.timeFormat === "12_hour",
  }).format(value);
}

function formatDay(value: number, embed: PublicEmbedView) {
  const options: Intl.DateTimeFormatOptions =
    embed.dateFormat === "weekday_long"
      ? { weekday: "long", month: "long", day: "numeric" }
      : embed.dateFormat === "weekday_short"
        ? { weekday: "short", month: "short", day: "numeric" }
        : { month: "numeric", day: "numeric" };
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: embed.event.timezone }).format(value);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");
}

function SpeakerPhoto({ name, url }: { name: string; url?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--embed-primary)] text-sm font-semibold text-white" aria-hidden="true">
      {url && !failed ? <img src={url} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} /> : initials(name)}
    </span>
  );
}

function SessionMeta({ session, embed, hideRoom }: { session: PublicEmbedSession; embed: PublicEmbedView; hideRoom?: boolean }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
      {session.startTime !== undefined && <span>{formatTime(session.startTime, embed)}{session.endTime !== undefined ? `–${formatTime(session.endTime, embed)}` : ""}</span>}
      {!hideRoom && session.roomName && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{session.roomName}</span>}
      {session.trackName && <span className="font-medium text-[var(--embed-primary)]">{session.trackName}</span>}
    </div>
  );
}

export function EmbedRenderer({ embed }: { embed: PublicEmbedView }) {
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemDark(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const sessions = useMemo(
    () => embed.sessions.filter((session) =>
      (track === "all" || session.trackKey === track) &&
      `${session.title} ${session.speakerNames?.join(" ") ?? ""} ${session.trackName ?? ""}`.toLocaleLowerCase().includes(normalizedQuery),
    ),
    [embed.sessions, normalizedQuery, track],
  );
  const speakers = useMemo(
    () => embed.speakers.filter((speaker) =>
      `${speaker.name} ${speaker.bio ?? ""} ${speaker.sessions?.map((session) => session.title).join(" ") ?? ""}`.toLocaleLowerCase().includes(normalizedQuery),
    ),
    [embed.speakers, normalizedQuery],
  );

  useEffect(() => {
    const visibleKeys = new Set([...sessions.map((session) => session.key), ...speakers.map((speaker) => speaker.key)]);
    if (expanded && !visibleKeys.has(expanded)) setExpanded(null);
  }, [expanded, sessions, speakers]);

  const speakerView = embed.view === "speaker_gallery" || embed.view === "speaker_list";
  const searchable = embed.view !== "agenda" && embed.view !== "schedule_grid";
  const dark = embed.theme === "dark" || (embed.theme === "system" && systemDark);
  const empty = speakerView
    ? "No public speakers match this embed."
    : embed.view === "agenda"
      ? "The agenda has not been published yet."
      : "No published sessions match this embed.";
  const dayGroups = sessions.reduce<Array<{ label: string; sessions: PublicEmbedSession[] }>>((groups, session) => {
    const label = session.startTime === undefined ? "Schedule" : formatDay(session.startTime, embed);
    const existing = groups.find((group) => group.label === label);
    if (existing) existing.sessions.push(session);
    else groups.push({ label, sessions: [session] });
    return groups;
  }, []);
  const gridDayGroups = useMemo(() => {
    if (embed.view !== "schedule_grid") return [];
    return dayGroups.map((day) => {
      const rooms = Array.from(new Set(day.sessions.map((session) => session.roomName ?? "General")));
      const hours = Array.from(
        new Set(day.sessions.filter((session) => session.startTime !== undefined).map((session) => session.startTime as number)),
      ).sort((left, right) => left - right);
      return { label: day.label, rooms, hours, sessions: day.sessions };
    });
  }, [dayGroups, embed.view]);

  return (
    <section
      className={`${dark ? "dark bg-background text-foreground" : "bg-background text-foreground"} min-h-full rounded-md p-3 sm:p-4`}
      style={{ "--embed-primary": embed.primaryColor } as CSSProperties}
    >
      <div className="mx-auto max-w-5xl space-y-4">
        <header>
          <h1 className="text-lg font-semibold">{embed.event.name}</h1>
          <p className="text-sm text-muted-foreground">{embed.name}</p>
        </header>

        {searchable && (
          <div className="flex flex-col gap-2 sm:flex-row" aria-label="Embed filters">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={speakerView ? "Search speakers" : "Search sessions"}
                placeholder={speakerView ? "Search speakers" : "Search sessions"}
                className="pl-9"
              />
            </div>
            {!speakerView && embed.tracks.length > 1 && (
              <Select value={track} onValueChange={setTrack}>
                <SelectTrigger aria-label="Filter by track" className="sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tracks</SelectItem>
                  {embed.tracks.map((item) => <SelectItem key={item.key} value={item.key}>{item.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {speakerView ? (
          <div className={embed.view === "speaker_gallery" ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2"}>
            {speakers.map((speaker) => {
              const isExpanded = expanded === speaker.key;
              return (
                <article key={speaker.key} className={cardSurfaceClasses("default", "bg-muted/60 p-3")}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-sm text-left focus-visible:outline-none"
                    aria-expanded={isExpanded}
                    aria-controls={`${speaker.key}-details`}
                    onClick={() => setExpanded(isExpanded ? null : speaker.key)}
                  >
                    <SpeakerPhoto name={speaker.name} url={speaker.headshotUrl} />
                    <span className="min-w-0 flex-1 font-medium">{speaker.name}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                  {isExpanded && (
                    <div id={`${speaker.key}-details`} className="mt-3 space-y-2 text-sm text-muted-foreground">
                      {speaker.bio && <p className="max-w-[70ch] whitespace-pre-wrap">{speaker.bio}</p>}
                      {speaker.sessions?.length ? (
                        <ul className="space-y-1">{speaker.sessions.map((session, index) => <li key={`${speaker.key}-${index}`}><span className="font-medium text-foreground">{session.title}</span>{session.startTime !== undefined ? ` · ${formatTime(session.startTime, embed)}` : ""}{session.roomName ? ` · ${session.roomName}` : ""}</li>)}</ul>
                      ) : null}
                      {speaker.links?.length ? <p className="flex flex-wrap gap-3">{speaker.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="font-medium text-[var(--embed-primary)] underline underline-offset-2">{link.label}</a>)}</p> : null}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : embed.view === "agenda" ? (
          <div className="space-y-5">
            {dayGroups.map((group) => (
              <section key={group.label} aria-labelledby={`day-${group.label}`}>
                <h2 id={`day-${group.label}`} className="mb-2 text-sm font-semibold">{group.label}</h2>
                <div className="space-y-2">{group.sessions.map((session) => <article key={session.key} className={cardSurfaceClasses("default", "bg-muted/60 p-3")}><h3 className="font-medium">{session.title}</h3><SessionMeta session={session} embed={embed} />{session.speakerNames?.length ? <p className="mt-2 text-sm text-muted-foreground">{session.speakerNames.join(", ")}</p> : null}</article>)}</div>
              </section>
            ))}
          </div>
        ) : embed.view === "schedule_itinerary" ? (
          <div className="space-y-5">{dayGroups.map((group) => <section key={group.label}><h2 className="mb-2 text-sm font-semibold">{group.label}</h2><div className="space-y-2">{group.sessions.map((session) => <article key={session.key} className={cardSurfaceClasses("default", "bg-muted/60 p-3")}><h3 className="font-medium">{session.title}</h3><SessionMeta session={session} embed={embed} />{session.speakerNames?.length ? <p className="mt-2 text-sm text-muted-foreground">{session.speakerNames.join(", ")}</p> : null}</article>)}</div></section>)}</div>
        ) : embed.view === "schedule_grid" ? (
          <div className="space-y-6">
            {gridDayGroups.map((day) => (
              <section key={day.label} aria-labelledby={`grid-day-${day.label}`}>
                <h2 id={`grid-day-${day.label}`} className="mb-2 text-sm font-semibold">{day.label}</h2>
                <div className="overflow-x-auto rounded-md">
                  <table className="w-full min-w-[640px] border-separate border-spacing-2">
                    <thead>
                      <tr>
                        <th scope="col" className="w-24 text-left text-xs font-medium text-muted-foreground">Time</th>
                        {day.rooms.map((room) => (
                          <th key={room} scope="col" className="min-w-[180px] text-left text-xs font-medium text-muted-foreground">{room}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {day.hours.map((hour) => (
                        <tr key={hour}>
                          <th scope="row" className="align-top text-left text-xs font-medium text-muted-foreground">{formatTime(hour, embed)}</th>
                          {day.rooms.map((room) => {
                            const cellSessions = day.sessions.filter(
                              (session) => session.startTime === hour && (session.roomName ?? "General") === room,
                            );
                            return (
                              <td key={room} className="align-top">
                                {cellSessions.map((session) => (
                                  <article key={session.key} className={cardSurfaceClasses("default", "bg-muted/60 p-2")}>
                                    <h3 className="text-sm font-medium">{session.title}</h3>
                                    <SessionMeta session={session} embed={embed} hideRoom />
                                    {session.speakerNames?.length ? <p className="mt-1 text-xs text-muted-foreground">{session.speakerNames.join(", ")}</p> : null}
                                  </article>
                                ))}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-2">{sessions.map((session) => <article key={session.key} className={cardSurfaceClasses("default", "bg-muted/60 p-3")}><h2 className="font-medium">{session.title}</h2><SessionMeta session={session} embed={embed} />{session.speakerNames?.length ? <p className="mt-2 text-sm text-muted-foreground">{session.speakerNames.join(", ")}</p> : null}</article>)}</div>
        )}

        {((speakerView && speakers.length === 0) || (!speakerView && sessions.length === 0)) && (
          <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>
        )}
        <footer className="pt-3 text-center text-xs text-muted-foreground">Powered by Namos Sessions</footer>
      </div>
    </section>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
