import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { SHORTCUTS, formatShortcut } from "@/lib/shortcuts";

const THEME_MODES = ["light", "dark"] as const;
type ThemeMode = (typeof THEME_MODES)[number];

export function ThemeToggleMenuItem() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const current: ThemeMode = theme === "dark" ? "dark" : "light";
  const next: ThemeMode = current === "dark" ? "light" : "dark";
  const Icon = current === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-live="polite"
      aria-label={`Theme: ${current}. Switch to ${next}`}
      title={`Current theme: ${current}`}
      className={cn(
        "flex w-full cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 text-left">{current === "dark" ? "Dark mode" : "Light mode"}</span>
      <kbd className="text-[10px] text-muted-foreground">{formatShortcut(SHORTCUTS.theme).join("")}</kbd>
    </button>
  );
}
