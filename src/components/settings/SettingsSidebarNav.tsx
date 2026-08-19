import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SETTINGS_NAV_GROUPS, type SettingsTabId } from "./settings-nav";

export function SettingsSidebarNav({ activeTab, onTabChange, onOpenEmbeds }: { activeTab: SettingsTabId; onTabChange: (tab: SettingsTabId) => void; onOpenEmbeds: () => void }) {
  return (
    <nav aria-label="Settings" className="space-y-6 p-4">
      {SETTINGS_NAV_GROUPS.map((group) => (
        <section key={group.label} className="space-y-1">
          <h2 className="px-2 text-xs font-semibold text-muted-foreground">{group.label}</h2>
          {group.items.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              onClick={() => item.id === "embeds" ? onOpenEmbeds() : onTabChange(item.id)}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                activeTab === item.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Button>
          ))}
        </section>
      ))}
    </nav>
  );
}
