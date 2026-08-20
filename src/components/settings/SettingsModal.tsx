import { lazy, Suspense, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SettingsSidebarNav } from "./SettingsSidebarNav";
import type { SettingsTabId } from "./settings-nav";
import { useOptionalCurrentEvent } from "@/components/EventContext";

const EventDetails = lazy(() => import("@/pages/settings/EventDetails"));
const EventTeam = lazy(() => import("@/pages/settings/EventTeam"));
const Library = lazy(() => import("@/pages/settings/Library"));
const TaskTemplates = lazy(() => import("@/pages/settings/TaskTemplates"));
const Integrations = lazy(() => import("@/pages/settings/Integrations"));
const ApiKeys = lazy(() => import("@/pages/settings/ApiKeys"));
const ActivityLog = lazy(() => import("@/pages/settings/ActivityLog"));
const OrganizationSettings = lazy(() => import("@/pages/settings/OrganizationSettings"));

const panels: Record<SettingsTabId, ComponentType> = {
  event: EventDetails,
  team: EventTeam,
  library: Library,
  "task-templates": TaskTemplates,
  integrations: Integrations,
  api: ApiKeys,
  activity: ActivityLog,
  organization: OrganizationSettings,
};

export function SettingsModal({ open, activeTab, onOpenChange, onTabChange }: { open: boolean; activeTab: SettingsTabId; onOpenChange: (open: boolean) => void; onTabChange: (tab: SettingsTabId) => void }) {
  const Panel = panels[activeTab];
  const navigate = useNavigate();
  const event = useOptionalCurrentEvent();
  const openEmbeds = () => {
    onOpenChange(false);
    navigate(event ? `/events/${event.event.slug}/cms/embeds` : "/events");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[min(48rem,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100%-2rem))] max-w-none grid-cols-[13rem_minmax(0,1fr)] gap-0 overflow-hidden border-0 bg-background p-0 shadow-none sm:rounded-lg sm:p-0">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">Manage this event and organization.</DialogDescription>
        <aside className="min-h-0 overflow-y-auto bg-muted/40"><SettingsSidebarNav activeTab={activeTab} onTabChange={onTabChange} onOpenEmbeds={openEmbeds} /></aside>
        <div className="min-h-0 overflow-y-auto p-6 pr-12">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading settings…</p>}><Panel /></Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}
