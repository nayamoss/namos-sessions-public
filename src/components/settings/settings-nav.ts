import {
  Activity,
  Blocks,
  CalendarCog,
  KeyRound,
  Library,
  Plug,
  Users,
  Building2,
  Code2,
  type LucideIcon,
} from "lucide-react";

export type SettingsTabId =
  | "event"
  | "team"
  | "library"
  | "task-templates"
  | "integrations"
  | "api"
  | "activity"
  | "organization";

export type SettingsNavItem = {
  id: SettingsTabId | "embeds";
  label: string;
  icon: LucideIcon;
};

export type SettingsNavGroup = {
  label: string;
  items: SettingsNavItem[];
};

export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  {
    label: "Event",
    items: [
      { id: "event", label: "Event details", icon: CalendarCog },
      { id: "team", label: "Team", icon: Users },
      { id: "library", label: "Library", icon: Library },
      { id: "task-templates", label: "Task templates", icon: Blocks },
      { id: "integrations", label: "Integrations", icon: Plug },
      { id: "embeds", label: "Embeds", icon: Code2 },
      { id: "api", label: "API keys", icon: KeyRound },
      { id: "activity", label: "Activity log", icon: Activity },
    ],
  },
  {
    label: "Organization",
    items: [{ id: "organization", label: "Organization settings", icon: Building2 }],
  },
];

const eventPath = (eventSlug: string, tab: Exclude<SettingsTabId, "organization">) =>
  `/events/${eventSlug}/settings/${tab}`;

export function settingsPath(tab: SettingsTabId, eventSlug?: string) {
  if (tab === "organization") return "/settings/organization";
  return eventSlug ? eventPath(eventSlug, tab) : `/settings/${tab}`;
}

export function settingsTabFromPath(pathname: string): SettingsTabId | undefined {
  if (pathname === "/settings/organization") return "organization";
  const match = pathname.match(/\/settings\/(event|team|library|task-templates|integrations|api|activity)$/);
  return match?.[1] as SettingsTabId | undefined;
}
