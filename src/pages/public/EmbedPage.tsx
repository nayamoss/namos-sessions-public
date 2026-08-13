import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { EmptyState } from "@/components/shared/EmptyState";
import { PublicLayout } from "@/components/PublicLayout";
import { useRepo } from "@/data/repo";
import type { PublicEmbed, PublicEmbedAgendaItem } from "@/data/types";
import { richTextToPlainText } from "@/lib/rich-text";
import {
  agendaDayTrackGroups,
  embedFeedEmptyCopy,
  embedFeedTitles,
  isEmbedFeed,
  itineraryDayGroups,
  sessionTrackGroups,
  type EmbedFeed,
} from "@/lib/public-embed";

function time(value: number, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone }).format(value);
}

function itemKey(item: PublicEmbedAgendaItem) {
  return `${item.startTime}-${item.title}`;
}

/** Day, then track — the time-based view of the program. */
function AgendaFeed({ embed }: { embed: PublicEmbed }) {
  if (!embed.agenda.length) return <EmptyState compact className="rounded-lg bg-card" message={embedFeedEmptyCopy.agenda} />;
  return (
    <section className="space-y-7">
      {agendaDayTrackGroups(embed).map(day => (
        <section key={day.label} className="space-y-4">
          <h2 className="text-lg font-semibold">{day.label}</h2>
          {day.tracks.map(({ track, items }) => (
            <div key={track} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{track}</h3>
              {items.map(item => (
                <article key={itemKey(item)} className="rounded-lg bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">{time(item.startTime, embed.eventTimezone)} · {item.roomName}</p>
                  <h4 className="mt-1 font-semibold">{item.title}</h4>
                  {item.speakerNames.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{item.speakerNames.join(", ")}</p>}
                </article>
              ))}
            </div>
          ))}
        </section>
      ))}
    </section>
  );
}

/**
 * Catalog browsing: topic first, time last. There is no day grouping here on
 * purpose — that is what the agenda feed is for.
 */
function SessionsFeed({ embed }: { embed: PublicEmbed }) {
  if (!embed.agenda.length) return <EmptyState compact className="rounded-lg bg-card" message={embedFeedEmptyCopy.sessions} />;
  return (
    <section className="space-y-8">
      {sessionTrackGroups(embed).map(({ track, items }) => (
        <section key={track} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{track}</h2>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{items.length} {items.length === 1 ? "session" : "sessions"}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map(item => (
              <article key={itemKey(item)} className="rounded-lg bg-card p-5">
                <h3 className="font-semibold leading-6">{item.title}</h3>
                {item.speakerNames.length > 0 && <p className="mt-2 text-sm text-muted-foreground">{item.speakerNames.join(", ")}</p>}
                <p className="mt-3 text-xs text-muted-foreground">{item.roomName}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

/**
 * A printable run of show: one flat, time-ordered list per day, with no track
 * sub-grouping, so a reader can follow the event top to bottom.
 */
function ItineraryFeed({ embed }: { embed: PublicEmbed }) {
  if (!embed.agenda.length) return <EmptyState compact className="rounded-lg bg-card" message={embedFeedEmptyCopy.itinerary} />;
  return (
    <section className="space-y-8">
      {itineraryDayGroups(embed).map(day => (
        <section key={day.label} className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">{day.label}</h2>
          <ol className="space-y-2">
            {day.items.map(item => (
              <li key={itemKey(item)} className="rounded-md bg-card p-4 sm:flex sm:gap-6">
                <p className="shrink-0 text-sm font-semibold tabular-nums sm:w-40">{time(item.startTime, embed.eventTimezone)} – {time(item.endTime, embed.eventTimezone)}</p>
                <div className="mt-1 sm:mt-0">
                  <p className="font-medium leading-6">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{[item.roomName, item.trackName, ...(item.speakerNames.length ? [item.speakerNames.join(", ")] : [])].filter(Boolean).join(" · ")}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </section>
  );
}

function SpeakersFeed({ embed }: { embed: PublicEmbed }) {
  if (!embed.speakers.length) return <EmptyState compact className="rounded-lg bg-card" message={embedFeedEmptyCopy.speakers} />;
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      {embed.speakers.map(speaker => (
        <article key={speaker.name} className="rounded-lg bg-card p-5">
          <div className="flex items-center gap-3">
            {speaker.headshotUrl
              ? <img src={speaker.headshotUrl} alt={`${speaker.name}'s headshot`} className="h-14 w-14 rounded-full object-cover" />
              : <div aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">{speaker.name.split(" ").map(part => part[0]).join("")}</div>}
            <h2 className="font-semibold">{speaker.name}</h2>
          </div>
          {speaker.bio && <p className="mt-4 text-sm leading-6 text-muted-foreground">{richTextToPlainText(speaker.bio)}</p>}
          {speaker.links.length > 0 && (
            <nav aria-label={`${speaker.name}'s links`} className="mt-4 flex flex-wrap gap-x-3 gap-y-2 text-sm">
              {speaker.links.map(link => (
                <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4 hover:text-muted-foreground">
                  {link.label}<span className="sr-only"> (opens in a new tab)</span>
                </a>
              ))}
            </nav>
          )}
        </article>
      ))}
    </section>
  );
}

function EmbedFeedView({ feed, embed }: { feed: EmbedFeed; embed: PublicEmbed }) {
  if (feed === "agenda") return <AgendaFeed embed={embed} />;
  if (feed === "sessions") return <SessionsFeed embed={embed} />;
  if (feed === "itinerary") return <ItineraryFeed embed={embed} />;
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
    repo.publicEmbeds.get(eventSlug)
      .then(value => { if (active) setEmbed(value); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load this embed."); });
    return () => { active = false; };
  }, [eventSlug, repo]);

  if (!isEmbedFeed(feed)) return <PublicLayout><main className="rounded-lg bg-card p-6"><h1 className="text-xl font-semibold">Page not found</h1><p className="mt-2 text-sm text-muted-foreground">This public event page does not exist.</p></main></PublicLayout>;
  if (error) return <PublicLayout><p className="text-sm text-destructive">{error}</p></PublicLayout>;
  if (embed === undefined) return <PublicLayout><SkeletonList rows={4} label="Loading event…" /></PublicLayout>;
  if (!embed) return <PublicLayout><p className="text-sm text-muted-foreground">This published event was not found.</p></PublicLayout>;

  return (
    <PublicLayout>
      <header className="rounded-lg bg-muted/60 p-5">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{embed.eventName}</p>
        <h1 className="mt-1 text-2xl font-semibold">{embedFeedTitles[feed]}</h1>
      </header>
      <EmbedFeedView feed={feed} embed={embed} />
      <p className="text-center text-xs text-muted-foreground">Powered by Namos Sessions</p>
    </PublicLayout>
  );
}
