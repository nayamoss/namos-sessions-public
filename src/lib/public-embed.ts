import { useEffect, type RefObject } from "react";
import type {
  Embed,
  EmbedFieldOptions,
  EmbedId,
  EmbedView,
  EmbedWrite,
  PublicEmbed,
  PublicEmbedAgendaItem,
} from "@/data/types";

export const embedViews: EmbedView[] = [
  "agenda",
  "schedule_itinerary",
  "schedule_grid",
  "session_list",
  "speaker_gallery",
  "speaker_list",
];
export const embedViewLabels: Record<EmbedView, string> = {
  agenda: "Agenda",
  schedule_itinerary: "Schedule itinerary",
  schedule_grid: "Schedule grid",
  session_list: "Session list",
  speaker_gallery: "Speaker gallery",
  speaker_list: "Speaker list",
};
export const embedViewDescriptions: Record<EmbedView, string> = {
  agenda: "A time-ordered event agenda.",
  schedule_itinerary: "A searchable chronological schedule.",
  schedule_grid:
    "A day-by-day timetable with rooms as columns and time slots as rows.",
  session_list: "A browsable list of published sessions.",
  speaker_gallery: "A visual gallery of accepted speakers.",
  speaker_list: "An alphabetical speaker directory.",
};
export const requiredEmbedFields = {
  agenda: ["title", "time", "room"],
  session: ["title"],
  speaker: ["name"],
} as const;
export const defaultEmbedFields: EmbedFieldOptions = {
  agenda: { title: true, time: true, room: true, track: true, speakers: true, recording: true },
  session: { title: true, time: true, room: true, track: true, speakers: true, recording: true },
  speaker: {
    name: true,
    headshot: true,
    bio: true,
    links: true,
    sessions: true,
  },
};
export function defaultEmbed(eventId: EmbedWrite["eventId"]): EmbedWrite {
  return {
    eventId,
    name: "",
    format: "styled_html",
    view: "agenda",
    enabled: true,
    theme: "system",
    primaryColor: "#E56B5D",
    dateFormat: "weekday_long",
    timeFormat: "12_hour",
    trackIds: [],
    fields: structuredClone(defaultEmbedFields),
  };
}
export function embedWriteFromEmbed(embed: Embed): EmbedWrite {
  const {
    id,
    eventId,
    name,
    format,
    view,
    enabled,
    theme,
    primaryColor,
    dateFormat,
    timeFormat,
    trackIds,
    fields,
  } = embed;
  return {
    id,
    eventId,
    name,
    format,
    view,
    enabled,
    theme,
    primaryColor,
    dateFormat,
    timeFormat,
    trackIds: [...trackIds],
    fields: { ...structuredClone(fields), agenda: { ...fields.agenda, recording: fields.agenda.recording ?? false }, session: { ...fields.session, recording: fields.session.recording ?? false } },
  };
}
export function isHexColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}
export function publicEmbedOrigin(fallbackOrigin: string) {
  return import.meta.env.VITE_PUBLIC_EMBED_ORIGIN?.trim() || fallbackOrigin;
}
export function publicEmbedUrl(origin: string, embedId: EmbedId): string;
export function publicEmbedUrl(
  origin: string,
  eventSlug: string,
  feed: EmbedFeed,
): string;
export function publicEmbedUrl(
  origin: string,
  idOrSlug: string,
  legacyFeed?: EmbedFeed,
) {
  return new URL(
    legacyFeed
      ? `/e/${encodeURIComponent(idOrSlug)}/${legacyFeed}`
      : `/embed/${encodeURIComponent(idOrSlug)}`,
    origin,
  ).toString();
}
export function iframeHeight(view: EmbedView) {
  return view === "speaker_gallery"
    ? 880
    : view === "speaker_list"
      ? 720
      : view === "schedule_grid"
        ? 900
        : 760;
}
/** Shared discriminator for the postMessage exchanged between an embed page and the
 * inline resize listener shipped alongside its iframe snippet — see EMBED_RESIZE_SOURCE. */
export const EMBED_RESIZE_SOURCE = "namos-embed";
function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
/** JSON.stringify does not escape "<", ">" or "&", so a raw JSON.stringify result
 * embedded inside an HTML <script> block can break out of it — e.g. a value
 * containing "</script>" prematurely closes the tag and lets an attacker inject
 * arbitrary HTML/script into the page. Escape those three characters to their
 * \uXXXX form (valid inside a JS string, inert to the HTML parser) before any
 * JSON.stringify output is interpolated into <script> markup below. */
function jsonForScriptContext(value: unknown) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003C")
    .replaceAll(">", "\\u003E")
    .replaceAll("&", "\\u0026");
}
/** Frame id the resize listener below uses to pair a `message` event back to the
 * right `<iframe>` on host pages that embed more than one at once. */
function iframeElementId(embedId: EmbedId) {
  return `namos-embed-${embedId}`;
}
export function iframeSnippet(
  origin: string,
  embedId: EmbedId,
  view: EmbedView,
) {
  const src = escapeAttribute(publicEmbedUrl(origin, embedId));
  const title = escapeAttribute(
    `${embedViewLabels[view]} embed — Namos Sessions`,
  );
  const frameId = escapeAttribute(iframeElementId(embedId));
  const frame = `<iframe id="${frameId}" src="${src}" title="${title}" loading="lazy" width="100%" height="${iframeHeight(view)}" style="border:0;width:100%;" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  // Auto-resizes the iframe's height to fit its content (see PublicEmbedPage's
  // ResizeObserver). If this script is blocked (host CSP, JS disabled, a sandboxed
  // iframe missing allow-scripts) the iframe simply stays at the static height
  // attribute above — no broken embed, just today's fixed-height behavior.
  const script = `<script>(function(){var f=document.getElementById(${jsonForScriptContext(frameId)});if(!f)return;var origin;try{origin=new URL(f.src).origin;}catch(e){return;}window.addEventListener("message",function(event){if(event.origin!==origin)return;var data=event.data;if(!data||data.source!==${jsonForScriptContext(EMBED_RESIZE_SOURCE)}||data.embedId!==${jsonForScriptContext(embedId)})return;if(typeof data.height==="number"&&data.height>0){f.style.height=data.height+"px";}});})();</script>`;
  return `${frame}\n${script}`;
}

/** Reports this embed's rendered content height to whatever window it's embedded in
 * (see the listener script iframeSnippet() emits alongside the copied <iframe>).
 * A safe no-op when the page isn't inside an iframe (e.g. visiting /embed/:id directly). */
export function useReportSizeToParent(embedId: EmbedId, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (window.parent === window) return;
    const node = ref.current;
    if (!node) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastHeight = -1;
    const report = () => {
      const height = Math.ceil(node.getBoundingClientRect().height);
      if (height === lastHeight) return;
      lastHeight = height;
      window.parent.postMessage({ source: EMBED_RESIZE_SOURCE, embedId, height }, "*");
    };
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(report, 100);
    });
    observer.observe(node);
    report();
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [embedId, ref]);
}

/** Legacy public feeds remain live while saved embeds migrate customers to opaque IDs. */
export const embedFeeds = [
  "agenda",
  "sessions",
  "itinerary",
  "speakers",
  "gallery",
] as const;
export type EmbedFeed = (typeof embedFeeds)[number];
export function isEmbedFeed(value: string | undefined): value is EmbedFeed {
  return embedFeeds.includes(value as EmbedFeed);
}
export const embedFeedTitles: Record<EmbedFeed, string> = {
  agenda: "Agenda",
  sessions: "Sessions",
  itinerary: "Schedule itinerary",
  speakers: "Speakers",
  gallery: "Speaker gallery",
};
export const embedFeedEmptyCopy: Record<EmbedFeed, string> = {
  agenda: "The agenda has not been published yet.",
  sessions: "The session catalog has not been published yet.",
  itinerary: "The itinerary will appear once the schedule is published.",
  speakers: "Speakers will appear once accepted.",
  gallery: "Speakers will appear once accepted.",
};

/** Deterministic initials + a stable accent tone per person, drawn from existing design tokens. */
export function initialsFor(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return (
    (parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

const avatarTones = [
  "bg-accent text-accent-foreground",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-info/15 text-info",
  "bg-primary/10 text-primary",
] as const;

export function avatarToneFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return avatarTones[hash % avatarTones.length];
}
const uncategorized = "Uncategorized";
function groupByDay(embed: PublicEmbed) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: embed.eventTimezone,
  });
  const days = new Map<string, PublicEmbedAgendaItem[]>();
  for (const item of embed.agenda) {
    const label = formatter.format(item.startTime);
    days.set(label, [...(days.get(label) ?? []), item]);
  }
  return [...days.entries()].map(([label, items]) => ({ label, items }));
}
export function agendaDayTrackGroups(embed: PublicEmbed) {
  return groupByDay(embed).map((day) => {
    const tracks = new Map<string, PublicEmbedAgendaItem[]>();
    for (const item of day.items) {
      const track = item.trackName ?? uncategorized;
      tracks.set(track, [...(tracks.get(track) ?? []), item]);
    }
    return {
      label: day.label,
      tracks: [...tracks.entries()].map(([track, items]) => ({ track, items })),
    };
  });
}
export function itineraryDayGroups(embed: PublicEmbed) {
  return groupByDay(embed).map((day) => ({
    label: day.label,
    items: [...day.items].sort(
      (left, right) =>
        left.startTime - right.startTime ||
        left.title.localeCompare(right.title),
    ),
  }));
}
export function sessionTrackGroups(embed: PublicEmbed) {
  const tracks = new Map<string, PublicEmbedAgendaItem[]>();
  for (const item of embed.agenda) {
    const track = item.trackName ?? uncategorized;
    tracks.set(track, [...(tracks.get(track) ?? []), item]);
  }
  return [...tracks.entries()]
    .map(([track, items]) => ({
      track,
      items: [...items].sort((left, right) =>
        left.title.localeCompare(right.title),
      ),
    }))
    .sort((left, right) =>
      left.track === uncategorized
        ? 1
        : right.track === uncategorized
          ? -1
          : left.track.localeCompare(right.track),
    );
}
