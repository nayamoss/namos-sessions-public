import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { MapPin, Users, X } from "lucide-react";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { EmptyState } from "@/components/shared/EmptyState";
import { PublicLayout } from "@/components/PublicLayout";
import { cardSurfaceClasses } from "@/components/ui/card";
import { useRepo } from "@/data/repo";
import { cn } from "@/lib/utils";
import type { PublicEmbed, PublicEmbedAgendaItem, PublicEmbedSpeaker } from "@/data/types";
import { richTextToPlainText } from "@/lib/rich-text";
import {
  agendaDayTrackGroups,
  avatarToneFor,
  embedFeedEmptyCopy,
  embedFeedTitles,
  initialsFor,
  isEmbedFeed,
  itineraryDayGroups,
  sessionTrackGroups,
  type EmbedFeed,
} from "@/lib/public-embed";

function time(value: number, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone }).format(value);
}

function itemKey(item: PublicEmbedAgendaItem) {
  return item.sessionKey;
}

/** Looks up the full speaker record (photo, bio, links) behind an agenda item's name string. */
function speakerLookup(embed: PublicEmbed) {
  const byName = new Map(embed.speakers.map(speaker => [speaker.name, speaker]));
  return (name: string): PublicEmbedSpeaker | undefined => byName.get(name);
}

/** Photo if one exists, otherwise a deterministic initials avatar in a stable accent tone. */
function Avatar({ name, url, size = "md" }: { name: string; url?: string; size?: "sm" | "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const dims = size === "lg" ? "h-16 w-16 text-base" : size === "sm" ? "h-8 w-8 text-xs" : "h-11 w-11 text-sm";
  return (
    <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold", dims, avatarToneFor(name))}>
      {url && !failed
        ? <img src={url} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
        : initialsFor(name)}
    </span>
  );
}

function TrackBadge({ track }: { track: string }) {
  return <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", avatarToneFor(track))}>{track}</span>;
}

/** List | detail three-pane feel: the detail panel is an inline flex sibling that
 * pushes the list rather than a fixed overlay that covers it. */
function FeedLayout({ list, detail, onClose }: { list: ReactNode; detail: ReactNode | null; onClose: () => void }) {
  return (
    <div className="flex flex-col items-start gap-6 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-8">{list}</div>
      {detail && (
        <aside className={cardSurfaceClasses("default", "w-full shrink-0 space-y-4 p-5 lg:sticky lg:top-6 lg:w-[360px]")}>
          <button type="button" onClick={onClose} aria-label="Close details" className="ml-auto flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors hover:bg-muted/70">
            <X className="h-3.5 w-3.5" />
          </button>
          {detail}
        </aside>
      )}
    </div>
  );
}

function DayTabs({ days, active, onChange }: { days: string[]; active: string | null; onChange: (day: string | null) => void }) {
  if (days.length < 2) return null;
  const tabClass = (isActive: boolean) =>
    cn("shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors", isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70");
  return (
    <nav aria-label="Switch day" className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onChange(null)} className={tabClass(active === null)}>All days</button>
      {days.map(day => (
        <button key={day} type="button" onClick={() => onChange(day)} className={tabClass(active === day)}>{day}</button>
      ))}
    </nav>
  );
}

function SessionDetail({ item, embed }: { item: PublicEmbedAgendaItem; embed: PublicEmbed }) {
  const lookup = speakerLookup(embed);
  return (
    <div className="space-y-4">
      {item.trackName && <TrackBadge track={item.trackName} />}
      <h2 className="text-xl font-semibold leading-6">{item.title}</h2>
      <div className="space-y-1.5 text-sm text-muted-foreground">
        <p>{time(item.startTime, embed.eventTimezone)} – {time(item.endTime, embed.eventTimezone)}</p>
        <p className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{item.roomName}</p>
      </div>
      {item.speakers.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"><Users className="h-3.5 w-3.5" />Speaking</p>
          <ul className="space-y-2">
            {item.speakers.map(({ speakerKey, name }) => {
              const speaker = lookup(name);
              return (
                <li key={speakerKey} className="flex items-center gap-3">
                  <Avatar name={name} url={speaker?.headshotUrl} size="sm" />
                  <span className="text-sm font-medium">{name}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function SpeakerDetail({ speaker, embed }: { speaker: PublicEmbedSpeaker; embed: PublicEmbed }) {
  const sessions = embed.agenda.filter(item => item.speakers.some(s => s.name === speaker.name));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar name={speaker.name} url={speaker.headshotUrl} size="lg" />
        <h2 className="text-xl font-semibold leading-6">{speaker.name}</h2>
      </div>
      {speaker.bio && <p className="text-sm leading-6 text-muted-foreground">{richTextToPlainText(speaker.bio)}</p>}
      {speaker.links.length > 0 && (
        <nav aria-label={`${speaker.name}'s links`} className="flex flex-wrap gap-x-3 gap-y-2 text-sm">
          {speaker.links.map(link => (
            <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="font-medium text-accent-foreground underline underline-offset-4 hover:text-foreground">
              {link.label}<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ))}
        </nav>
      )}
      {sessions.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Sessions</p>
          <ul className="space-y-2">
            {sessions.map(item => (
              <li key={itemKey(item)} className="rounded-md bg-muted/60 p-3">
                <p className="text-sm font-medium leading-5">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{time(item.startTime, embed.eventTimezone)} · {item.roomName}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Day, then track — the time-based view of the program. */
function AgendaFeed({ embed }: { embed: PublicEmbed }) {
  const [day, setDay] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const groups = agendaDayTrackGroups(embed);
  const visible = day ? groups.filter(group => group.label === day) : groups;
  const selectedItem = selected ? embed.agenda.find(item => itemKey(item) === selected) : undefined;

  if (!embed.agenda.length) return <EmptyState compact className={cardSurfaceClasses("default")} message={embedFeedEmptyCopy.agenda} />;
  return (
    <FeedLayout
      onClose={() => setSelected(null)}
      detail={selectedItem ? <SessionDetail item={selectedItem} embed={embed} /> : null}
      list={
        <>
          <DayTabs days={groups.map(day => day.label)} active={day} onChange={setDay} />
          {visible.map(day => (
            <section key={day.label} className="space-y-4">
              <h2 className="text-xl font-semibold">{day.label}</h2>
              {day.tracks.map(({ track, items }) => (
                <div key={track} className="space-y-2.5">
                  <h3 className="text-sm font-medium text-muted-foreground">{track}</h3>
                  {items.map(item => (
                    <button
                      key={itemKey(item)}
                      type="button"
                      onClick={() => setSelected(itemKey(item))}
                      className={cn(
                        cardSurfaceClasses("default", "block w-full p-4 text-left transition-colors hover:bg-muted/60"),
                        selected === itemKey(item) && "bg-muted/60",
                      )}
                    >
                      <p className="text-xs font-medium text-muted-foreground">{time(item.startTime, embed.eventTimezone)} · {item.roomName}</p>
                      <h4 className="mt-1 font-semibold leading-5">{item.title}</h4>
                      {item.speakers.length > 0 && <p className="mt-1.5 text-sm text-muted-foreground">{item.speakers.map((speaker) => speaker.name).join(", ")}</p>}
                    </button>
                  ))}
                </div>
              ))}
            </section>
          ))}
        </>
      }
    />
  );
}

/**
 * Catalog browsing: topic first, time last. There is no day grouping here on
 * purpose — that is what the agenda feed is for.
 */
function SessionsFeed({ embed }: { embed: PublicEmbed }) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedItem = selected ? embed.agenda.find(item => itemKey(item) === selected) : undefined;
  const lookup = speakerLookup(embed);

  if (!embed.agenda.length) return <EmptyState compact className={cardSurfaceClasses("default")} message={embedFeedEmptyCopy.sessions} />;
  return (
    <FeedLayout
      onClose={() => setSelected(null)}
      detail={selectedItem ? <SessionDetail item={selectedItem} embed={embed} /> : null}
      list={sessionTrackGroups(embed).map(({ track, items }) => (
        <section key={track} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{track}</h2>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{items.length} {items.length === 1 ? "session" : "sessions"}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map(item => (
              <article key={itemKey(item)}>
                <button
                  type="button"
                  onClick={() => setSelected(itemKey(item))}
                  className={cn(
                    cardSurfaceClasses("default", "block w-full p-5 text-left transition-colors hover:bg-muted/60"),
                    selected === itemKey(item) && "bg-muted/60",
                  )}
                >
                  <h3 className="font-semibold leading-6">{item.title}</h3>
                  {item.speakers.length > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {item.speakers.slice(0, 4).map(speaker => <Avatar key={speaker.speakerKey} name={speaker.name} url={lookup(speaker.name)?.headshotUrl} size="sm" />)}
                      </div>
                      <p className="min-w-0 truncate text-sm text-muted-foreground">{item.speakers.map(speaker => speaker.name).join(", ")}</p>
                    </div>
                  )}
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{item.roomName}</p>
                </button>
              </article>
            ))}
          </div>
        </section>
      ))}
    />
  );
}

/**
 * A printable run of show: one flat, time-ordered list per day, with no track
 * sub-grouping, so a reader can follow the event top to bottom.
 */
function ItineraryFeed({ embed }: { embed: PublicEmbed }) {
  const [day, setDay] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const days = itineraryDayGroups(embed);
  const visible = day ? days.filter(entry => entry.label === day) : days;
  const selectedItem = selected ? embed.agenda.find(item => itemKey(item) === selected) : undefined;

  if (!embed.agenda.length) return <EmptyState compact className={cardSurfaceClasses("default")} message={embedFeedEmptyCopy.itinerary} />;
  return (
    <FeedLayout
      onClose={() => setSelected(null)}
      detail={selectedItem ? <SessionDetail item={selectedItem} embed={embed} /> : null}
      list={
        <>
          <DayTabs days={days.map(entry => entry.label)} active={day} onChange={setDay} />
          {visible.map(day => (
            <section key={day.label} className="space-y-3">
              <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">{day.label}</h2>
              <ol className="space-y-2">
                {day.items.map(item => (
                  <li key={itemKey(item)}>
                    <button
                      type="button"
                      onClick={() => setSelected(itemKey(item))}
                      className={cn(
                        cardSurfaceClasses("default", "block w-full p-4 text-left transition-colors hover:bg-muted/60 sm:flex sm:gap-6"),
                        selected === itemKey(item) && "bg-muted/60",
                      )}
                    >
                      <p className="shrink-0 text-sm font-semibold tabular-nums sm:w-40">{time(item.startTime, embed.eventTimezone)} – {time(item.endTime, embed.eventTimezone)}</p>
                      <div className="mt-1 sm:mt-0">
                        <p className="font-medium leading-6">{item.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{[item.roomName, item.trackName, ...(item.speakers.length ? [item.speakers.map((speaker) => speaker.name).join(", ")] : [])].filter(Boolean).join(" · ")}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </>
      }
    />
  );
}

function SpeakersFeed({ embed }: { embed: PublicEmbed }) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedSpeaker = selected ? embed.speakers.find(speaker => speaker.name === selected) : undefined;

  if (!embed.speakers.length) return <EmptyState compact className={cardSurfaceClasses("default")} message={embedFeedEmptyCopy.speakers} />;
  return (
    <FeedLayout
      onClose={() => setSelected(null)}
      detail={selectedSpeaker ? <SpeakerDetail speaker={selectedSpeaker} embed={embed} /> : null}
      list={
        <section className="grid gap-4 sm:grid-cols-2">
          {embed.speakers.map(speaker => (
            <article key={speaker.name}>
              <button
                type="button"
                onClick={() => setSelected(speaker.name)}
                className={cn(
                  cardSurfaceClasses("default", "block w-full p-5 text-left transition-colors hover:bg-muted/60"),
                  selected === speaker.name && "bg-muted/60",
                )}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={speaker.name} url={speaker.headshotUrl} />
                  <h2 className="font-semibold">{speaker.name}</h2>
                </div>
                {speaker.bio && <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{richTextToPlainText(speaker.bio)}</p>}
              </button>
            </article>
          ))}
        </section>
      }
    />
  );
}

/** A visual photo gallery — larger tiles than the speaker directory, with the
 * name revealed as an overlay so the imagery leads. */
function GalleryFeed({ embed }: { embed: PublicEmbed }) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedSpeaker = selected ? embed.speakers.find(speaker => speaker.name === selected) : undefined;

  if (!embed.speakers.length) return <EmptyState compact className={cardSurfaceClasses("default")} message={embedFeedEmptyCopy.gallery} />;
  return (
    <FeedLayout
      onClose={() => setSelected(null)}
      detail={selectedSpeaker ? <SpeakerDetail speaker={selectedSpeaker} embed={embed} /> : null}
      list={
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {embed.speakers.map(speaker => (
            <button
              key={speaker.name}
              type="button"
              onClick={() => setSelected(speaker.name)}
              className={cn(
                cardSurfaceClasses("default", "group relative aspect-square overflow-hidden transition-transform hover:-translate-y-0.5"),
                selected === speaker.name && "ring-2 ring-primary/40",
              )}
            >
              {speaker.headshotUrl ? (
                <img src={speaker.headshotUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
              ) : (
                <div className={cn("flex h-full w-full items-center justify-center text-3xl font-semibold", avatarToneFor(speaker.name))}>{initialsFor(speaker.name)}</div>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-foreground/70 px-3 py-2 text-left text-sm font-medium text-background">{speaker.name}</span>
            </button>
          ))}
        </section>
      }
    />
  );
}

function EmbedFeedView({ feed, embed }: { feed: EmbedFeed; embed: PublicEmbed }) {
  if (feed === "agenda") return <AgendaFeed embed={embed} />;
  if (feed === "sessions") return <SessionsFeed embed={embed} />;
  if (feed === "itinerary") return <ItineraryFeed embed={embed} />;
  if (feed === "gallery") return <GalleryFeed embed={embed} />;
  return <SpeakersFeed embed={embed} />;
}

export default function EmbedPage() {
  const { eventSlug, feed } = useParams<{ eventSlug: string; feed: string }>();
  const repo = useRepo();
  const [embed, setEmbed] = useState<PublicEmbed | null>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    if (!eventSlug) return;
    repo.publicEmbeds.getLegacy(eventSlug)
      .then(value => { if (active) setEmbed(value); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load this embed."); });
    return () => { active = false; };
  }, [eventSlug, repo]);

  if (!isEmbedFeed(feed)) return <PublicLayout><main className={cardSurfaceClasses("default", "p-6")}><h1 className="text-xl font-semibold">Page not found</h1><p className="mt-2 text-sm text-muted-foreground">This public event page does not exist.</p></main></PublicLayout>;
  if (error) return <PublicLayout><p className="text-sm text-destructive">{error}</p></PublicLayout>;
  if (embed === undefined) return <PublicLayout><SkeletonList rows={4} label="Loading event…" /></PublicLayout>;
  if (!embed) return <PublicLayout><p className="text-sm text-muted-foreground">This published event was not found.</p></PublicLayout>;

  return (
    <PublicLayout>
      <header className={cardSurfaceClasses("default", "p-5")}>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{embed.eventName}</p>
        <h1 className="mt-1 text-2xl font-semibold">{embedFeedTitles[feed]}</h1>
      </header>
      <EmbedFeedView feed={feed} embed={embed} />
      <p className="text-center text-xs text-muted-foreground">Powered by Namos Sessions</p>
    </PublicLayout>
  );
}
