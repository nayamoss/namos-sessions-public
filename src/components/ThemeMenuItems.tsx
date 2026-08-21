import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { SHORTCUTS, formatShortcut } from "@/lib/shortcuts";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

const THEME_MODES = ["system", "light", "dark"] as const;
type ThemeMode = (typeof THEME_MODES)[number];

export function ThemeToggleMenuItem() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const current: ThemeMode = THEME_MODES.includes(theme as ThemeMode)
    ? (theme as ThemeMode)
    : "system";
  const resolved = resolvedTheme === "dark" ? "dark" : "light";
  const Icon = current === "system" ? Monitor : current === "dark" ? Moon : Sun;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger aria-label={`Theme: ${current}.`} className={cn("gap-2.5", "focus-visible:bg-accent")}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1">Theme</span>
        <span className="text-xs text-muted-foreground">{current === "system" ? `System · ${resolved}` : current}</span>
        <kbd className="text-[10px] text-muted-foreground">{formatShortcut(SHORTCUTS.theme).join("")}</kbd>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-44 bg-popover shadow-none">
        <DropdownMenuRadioGroup value={current} onValueChange={(value) => setTheme(value as ThemeMode)} aria-label="Color theme">
          <DropdownMenuRadioItem value="system"><Monitor className="mr-2 h-4 w-4" />System</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light"><Sun className="mr-2 h-4 w-4" />Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon className="mr-2 h-4 w-4" />Dark</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
