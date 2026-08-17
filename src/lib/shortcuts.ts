import {
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  ListTodo,
  Mail,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";

export type ShortcutBinding = {
  code: string;
  meta?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
};

export type ShortcutId = "palette" | "sidebar" | "rightPanel" | "help" | "voice";

const CODE_LABELS: Record<string, string> = {
  Slash: "/",
  Backslash: "\\",
  Escape: "Esc",
  Comma: ",",
  Period: ".",
  Space: "Space",
};

/**
 * Dispatched on `window` when the global Alt+V shortcut fires. Every page
 * that hosts an Operations Agent composer (DashboardHome, AgentOperations)
 * listens for this and opens its own VoiceSessionPanel, scoped to whatever
 * event it already has in context — mirrors Imori's `imori:toggle-voice`
 * pattern (app/dashboard/layout-client.tsx), one global shortcut fanning out
 * to whichever chat surface is actually mounted.
 */
export const VOICE_TOGGLE_EVENT = "namos:toggle-voice";

export function matchesShortcut(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  return event.code === binding.code
    && event.metaKey === Boolean(binding.meta)
    && event.ctrlKey === Boolean(binding.ctrl)
    && event.altKey === Boolean(binding.alt)
    && event.shiftKey === Boolean(binding.shift);
}

export function matchesPrimaryShortcut(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  if (!binding.meta || binding.ctrl) return matchesShortcut(event, binding);

  return matchesShortcut(event, binding) || matchesShortcut(event, {
    ...binding,
    meta: false,
    ctrl: true,
  });
}

export function isKeyboardShortcutBlocked(doc: Document): boolean {
  const activeElement = doc.activeElement;
  const typingSelector = [
    "input",
    "textarea",
    "select",
    "[contenteditable='true']",
    "[role='textbox']",
    "[role='combobox']",
    "[role='searchbox']",
    "[cmdk-root]",
  ].join(",");

  return Boolean(
    (activeElement instanceof Element && activeElement.closest(typingSelector))
    || doc.querySelector('[role="dialog"]:not([aria-hidden="true"])'),
  );
}

export function formatShortcut(binding: ShortcutBinding): string[] {
  const tokens: string[] = [];
  if (binding.meta) tokens.push("⌘");
  if (binding.ctrl) tokens.push("Ctrl");
  if (binding.alt) tokens.push("⌥");
  if (binding.shift) tokens.push("⇧");

  const key = CODE_LABELS[binding.code]
    ?? binding.code.replace(/^Key/, "").replace(/^Digit/, "");
  tokens.push(key);
  return tokens;
}

export const SHORTCUTS: Record<ShortcutId, ShortcutBinding> = {
  palette: { code: "KeyK", meta: true },
  sidebar: { code: "Slash", meta: true },
  rightPanel: { code: "Backslash", meta: true },
  help: { code: "Slash", shift: true },
  // Deliberately Alt, not Cmd/Ctrl+Shift+V — that's "paste without
  // formatting" in every browser and OS. Matches Imori's binding exactly.
  voice: { code: "KeyV", alt: true },
};

export type GoToSequence = {
  key: string;
  code: string;
  to: string;
  label: string;
  icon: LucideIcon;
};

export const GO_TO_SEQUENCES: readonly GoToSequence[] = [
  { key: "d", code: "KeyD", to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "s", code: "KeyS", to: "/program/speakers", label: "Speakers", icon: Users },
  { key: "f", code: "KeyF", to: "/program/forms", label: "Calls for papers", icon: FileText },
  { key: "a", code: "KeyA", to: "/program/abstracts", label: "Submissions", icon: ClipboardList },
  { key: "e", code: "KeyE", to: "/program/evaluation", label: "Judge submissions", icon: ListTodo },
  { key: "g", code: "KeyG", to: "/program/agenda", label: "Schedule", icon: CalendarDays },
  { key: "c", code: "KeyC", to: "/program/communications", label: "Communications", icon: Mail },
  { key: "v", code: "KeyV", to: "/program/availability", label: "Availability", icon: CalendarClock },
  { key: "t", code: "KeyT", to: "/portals/tasks", label: "Portal tasks", icon: ListTodo },
  { key: ",", code: "Comma", to: "/settings/event", label: "Event settings", icon: Settings2 },
] as const;

export const COMMAND_ROUTES = [
  ...GO_TO_SEQUENCES,
  { to: "/portals/forms", label: "Portal forms", icon: FileText },
  { to: "/settings/library", label: "Library", icon: Settings2 },
  { to: "/settings/email", label: "Email delivery", icon: Mail },
] as const;

export type ShortcutHelpGroup = {
  group: string;
  items: readonly { keys: readonly string[]; label: string }[];
};

export const SHORTCUT_HELP: readonly ShortcutHelpGroup[] = [
  {
    group: "Navigation",
    items: [
      { keys: formatShortcut(SHORTCUTS.palette), label: "Open command palette" },
      { keys: formatShortcut(SHORTCUTS.sidebar), label: "Toggle sidebar" },
      { keys: formatShortcut(SHORTCUTS.rightPanel), label: "Toggle right panel" },
    ],
  },
  {
    group: "Go to",
    items: GO_TO_SEQUENCES.map((item) => ({
      keys: ["g", item.key],
      label: item.label,
    })),
  },
  {
    group: "General",
    items: [
      { keys: ["?"], label: "Show keyboard shortcuts" },
      { keys: formatShortcut(SHORTCUTS.voice), label: "Start voice chat with the Operations Agent" },
    ],
  },
] as const;
