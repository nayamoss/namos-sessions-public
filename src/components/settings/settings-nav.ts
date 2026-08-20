import { Activity, Blocks, CalendarCog, Code2, KeyRound, Library, Plug, Users, type LucideIcon } from "lucide-react";

export type SettingsTabId = "event" | "team" | "library" | "task-templates" | "integrations" | "api" | "activity" | "embeds";
export type SettingsNavItem = { id: SettingsTabId; label: string; icon: LucideIcon };
export type SettingsNavGroup = { label: string; items: SettingsNavItem[] };

export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [{
  label: "Event",
  items: [
    { id: "event", label: "Event details", icon: CalendarCog },
    { id: "team", label: "Team", icon: Users },
    { id: "library", label: "Library", icon: Library },
    { id: "task-templates", label: "Task templates", icon: Blocks },
    { id: "integrations", label: "Integrations", icon: Plug },
    { id: "api", label: "API keys", icon: KeyRound },
    { id: "activity", label: "Activity log", icon: Activity },
    { id: "embeds", label: "Embeds", icon: Code2 },
  ],
}];

const eventPath = (eventSlug: string, tab: Exclude<SettingsTabId, "embeds">) => `/events/${eventSlug}/settings/${tab}`;
export function settingsPath(tab: SettingsTabId, eventSlug?: string) {
  if (tab === "embeds") return eventSlug ? `/events/${eventSlug}/cms/embeds` : "/events";
  return eventSlug ? eventPath(eventSlug, tab) : `/settings/${tab}`;
}
export function settingsTabFromPath(pathname: string): SettingsTabId | undefined {
  const match = pathname.match(/\/settings\/(event|team|library|task-templates|integrations|api|activity)$/);
  return match?.[1] as SettingsTabId | undefined;
}
