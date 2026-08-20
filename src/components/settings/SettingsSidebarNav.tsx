import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SETTINGS_NAV_GROUPS, type SettingsTabId } from "./settings-nav";

export function SettingsSidebarNav({ activeTab, onTabChange }: { activeTab: SettingsTabId; onTabChange: (tab: SettingsTabId) => void }) {
  const [query, setQuery] = useState("");
  const visibleGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return SETTINGS_NAV_GROUPS;
    return SETTINGS_NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => item.label.toLowerCase().includes(normalizedQuery)) })).filter((group) => group.items.length > 0);
  }, [query]);
  return (
    <nav aria-label="Settings" className="p-3">
      <label className="relative mb-5 block">
        <span className="sr-only">Search settings</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-9 min-h-0 bg-background pl-8 text-sm" />
      </label>
      <div className="space-y-5">
        {visibleGroups.map((group) => (
          <section key={group.label} aria-label={`${group.label} settings`}>
            <h2 className="mb-1 px-2 text-xs font-medium text-muted-foreground">{group.label === "Event" ? "Settings" : group.label}</h2>
            {group.items.map((item) => (
              <Button key={item.id} type="button" variant="ghost" aria-current={activeTab === item.id ? "page" : undefined} onClick={() => onTabChange(item.id)} className={cn("mb-0.5 flex h-8 min-h-0 w-full justify-start gap-3 rounded-md px-2 text-sm font-normal transition-colors", activeTab === item.id ? "bg-muted font-medium text-foreground hover:bg-muted" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground")}>
                <item.icon aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="truncate">{item.label}</span>
              </Button>
            ))}
          </section>
        ))}
        {visibleGroups.length === 0 && <p className="px-2 text-sm text-muted-foreground">No settings found.</p>}
      </div>
    </nav>
  );
}
