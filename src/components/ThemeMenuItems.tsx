import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const THEME_MODES = ["light", "dark", "system"] as const;
type ThemeMode = (typeof THEME_MODES)[number];

export function ThemeToggleMenuItem() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const current: ThemeMode = THEME_MODES.includes(theme as ThemeMode) ? theme as ThemeMode : "light";
  const resolved = resolvedTheme === "dark" ? "dark" : "light";
  const currentLabel = current === "system" ? `System (${resolved})` : current === "dark" ? "Dark" : "Light";
  const next = THEME_MODES[(THEME_MODES.indexOf(current) + 1) % THEME_MODES.length];
  const Icon = current === "system" ? Monitor : current === "dark" ? Moon : Sun;

  return (
    <button
      type="button"
      aria-live="polite"
      aria-label={`Theme: ${currentLabel}. Switch to ${next}`}
      title={`Theme: ${currentLabel} · click for ${next}`}
      onClick={() => setTheme(next)}
      className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground")}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>Theme: {currentLabel}</span>
    </button>
  );
}
