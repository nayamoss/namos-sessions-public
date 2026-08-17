import type { PublicEmbedAgendaItem } from "@/data/types";
import { richTextToPlainText } from "@/lib/rich-text";

export function attendeeScheduleStorageKey(eventSlug: string) {
  return `namos:attendee-schedule:${eventSlug}:v1`;
}

function googleDate(value: number) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function googleCalendarUrl(
  item: PublicEmbedAgendaItem,
  eventName: string,
  eventLocation?: string,
) {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", item.title);
  url.searchParams.set("dates", `${googleDate(item.startTime)}/${googleDate(item.endTime)}`);
  url.searchParams.set("details", [
    item.description ? richTextToPlainText(item.description) : undefined,
    item.speakers.length ? `Speakers: ${item.speakers.map((speaker) => speaker.name).join(", ")}` : undefined,
    `Part of ${eventName}`,
  ].filter(Boolean).join("\n\n"));
  url.searchParams.set("location", [item.roomName, item.locationDetails, eventLocation].filter(Boolean).join(" · "));
  return url.toString();
}

export function sessionMatchesSearch(item: PublicEmbedAgendaItem, search: string) {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return true;
  return [item.title, ...item.speakers.map((speaker) => speaker.name)]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

export function attendeeSessionState(
  item: PublicEmbedAgendaItem,
  now: number,
  nextSessionKey?: string,
) {
  if (item.startTime <= now && now < item.endTime) return "now" as const;
  if (item.sessionKey === nextSessionKey) return "up-next" as const;
  return undefined;
}
