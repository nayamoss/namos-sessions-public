import { useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  CalendarClock,
  CalendarDays,
  BookOpen,
  ChevronDown,
  LayoutDashboard,
  ClipboardCheck,
  ClipboardList,
  FileText,
  ListTodo,
  Megaphone,
  Mail,
  PanelLeft,
  PanelRight,
  Search,
  Users,
  ContactRound,
  ShieldCheck,
  Handshake,
  Bot,
  BarChart3,
  Video,
  Code2,
  Rss,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceOrb } from "@/components/voice/VoiceOrb";
import { VoiceSessionPanel } from "@/components/voice/VoiceSessionPanel";
import { NotificationBell } from "@/components/NotificationBell";
import { AccountMenu } from "@/components/AccountMenu";
import { SidebarProvider, useSidebarState } from "@/components/SidebarContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageContentSurface } from "@/components/shared/PageContentSurface";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CommandPalette } from "@/components/CommandPalette";
import { GlobalKeyboardShortcuts } from "@/components/GlobalKeyboardShortcuts";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { EventSwitcher } from "@/components/EventSwitcher";
import { useOptionalCurrentEvent } from "@/components/EventContext";
import { RepoContext } from "@/data/repo";
import { SettingsModalProvider } from "@/components/settings/SettingsModalContext";
import { selectedBackend } from "@/data/backend";

export type DashboardNavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
};

export type DashboardNavSection = {
  label: string;
  items: DashboardNavItem[];
};

const navSections: DashboardNavSection[] = [
  {
    label: "Dashboard",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  // Ordered as the CFP lifecycle runs: open the call → collect submissions →
  // judge them → build the program. The old alphabet-soup order ("Forms",
  // "Abstracts", "Evaluation") hid the three core jobs behind house jargon.
  {
    label: "CFP",
    items: [
      { to: "/program/forms", label: "Calls for papers", icon: Megaphone },
      { to: "/program/abstracts", label: "Submissions", icon: ClipboardList },
      { to: "/program/evaluation", label: "Judging", icon: ClipboardCheck },
    ],
  },
  {
    label: "Program",
    items: [
      { to: "/program/speakers", label: "Speaker CRM", icon: ContactRound },
      { to: "/program/event-speakers", label: "Event speakers", icon: Users },
      { to: "/program/contacts", label: "Contacts", icon: ContactRound },
      { to: "/organizations/:organizationId/contacts", label: "All contacts", icon: ContactRound },
      { to: "/program/agenda", label: "Schedule", icon: CalendarDays },
      { to: "/program/recordings", label: "Recordings", icon: Video },
      { to: "/program/sponsors", label: "Sponsors", icon: Handshake },
      { to: "/program/communications", label: "Communications", icon: Mail },
      { to: "/program/availability", label: "Availability", icon: CalendarClock },
      { to: "/program/readiness", label: "Readiness", icon: ShieldCheck },
    ],
  },
  {
    label: "Speaker portal",
    items: [
      { to: "/portals/forms", label: "Portal forms", icon: FileText },
      { to: "/portals/tasks", label: "Speaker tasks", icon: ListTodo },
      { to: "/portals/resources", label: "Resources", icon: BookOpen },
    ],
  },
  // Running the event day-to-day, as opposed to configuring how it's set up.
  {
    label: "Operations",
    items: [
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/program/agent", label: "Operations Agent", icon: Bot },
    ],
  },
  // Embeds/Feeds are content the public site pulls from, not event settings —
  // they get their own real nav spot rather than living inside the Settings modal.
  {
    label: "Content",
    items: [
      { to: "/cms/embeds", label: "Embeds", icon: Code2 },
      { to: "/cms/feeds", label: "Feeds", icon: Rss },
    ],
  },
];

// Organization settings lives in the account menu at the bottom of the sidebar
// (click the account name) instead of a standalone button up here — it was
// sitting above the event switcher with no clear relationship to anything.
function AdminWorkspaceMenus({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const repo = useContext(RepoContext);
  if (!repo?.organizers?.getMine || !repo.events?.listMine) return null;
  return <EventSwitcher collapsed={collapsed} onNavigate={onNavigate} />;
}

function Navigation({
  forceExpanded = false,
  onNavigate,
  sections,
}: {
  forceExpanded?: boolean;
  onNavigate?: () => void;
  sections: DashboardNavSection[];
}) {
  const location = useLocation();
  const sidebar = useSidebarState();
  const collapsed = forceExpanded ? false : sidebar.collapsed;
  const [sectionState, setSectionState] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};

    try {
      const saved = window.localStorage.getItem("namos-sidebar-section-state");
      const parsed = saved ? JSON.parse(saved) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });

  // Accordion behavior: opening a section auto-collapses every other
  // collapsible section, so only one nav group is expanded at a time.
  const toggleSection = (label: string) => {
    setSectionState((current) => {
      const opening = current[label] !== true;
      const next: Record<string, boolean> = {};
      for (const section of sections) {
        next[section.label] = section.label === label ? opening : false;
      }

      try {
        window.localStorage.setItem("namos-sidebar-section-state", JSON.stringify(next));
      } catch {
        // Navigation still works if local storage is unavailable.
      }

      return next;
    });
  };

  // A nav item's `to` can carry a query string (the "All contacts" deep link below stamps on
  // `?event=`); active-state matching only ever cares about the path portion.
  const basePath = (to: string) => to.split("?")[0]!;

  return (
    <nav className={cn("space-y-6 py-4", collapsed ? "px-2" : "px-3")}>
      {sections.map((section) => {
        const isCollapsible = section.items.length > 1;
        const hasActiveItem = section.items.some((item) =>
          item.end
            ? location.pathname === basePath(item.to)
            : location.pathname === basePath(item.to) || location.pathname.startsWith(`${basePath(item.to)}/`),
        );
        // Auto-collapsed by default: a section only opens if the user explicitly
        // expanded it, or it holds the active route.
        const expanded = !isCollapsible || hasActiveItem || sectionState[section.label] === true;
        const sectionId = `navigation-section-${section.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        // A lone item whose label repeats the section label (e.g. "Dashboard")
        // needs no header above it — that would just print the name twice.
        const showHeader = section.items.length > 1 || section.items[0]?.label !== section.label;

        return (
          <section key={section.label}>
            {!collapsed && showHeader && (
              <h2>
                {isCollapsible ? (
                  <button
                    type="button"
                    aria-controls={sectionId}
                    aria-expanded={expanded}
                    onClick={() => toggleSection(section.label)}
                    className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-foreground/65 transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span>{section.label}</span>
                    <ChevronDown
                      className={cn("h-3 w-3 transition-transform", !expanded && "-rotate-90")}
                      aria-hidden="true"
                    />
                  </button>
                ) : (
                  <span className="block px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-foreground/65">
                    {section.label}
                  </span>
                )}
              </h2>
            )}
            <div id={sectionId} hidden={!collapsed && !expanded} className={cn("space-y-1", !collapsed && "mt-1")}>
              {(collapsed ? section.items.slice(0, 1) : section.items).map((item) => {
                const active = item.end
                  ? location.pathname === basePath(item.to)
                  : location.pathname === basePath(item.to) || location.pathname.startsWith(`${basePath(item.to)}/`);
                const className = cn(
                  "touch-target group relative flex items-center rounded-md text-base font-medium transition-colors",
                  collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
                  active ? "bg-muted text-foreground" : "text-foreground/75 hover:bg-muted hover:text-foreground",
                );
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    aria-label={item.label}
                    // Tour steps target persistent sidebar items, not the account-menu's
                    // Settings/Speaker-portal links — those live inside a dropdown that's
                    // already closed by the time the tour starts (menu closes before
                    // startTour() runs), so a step aimed at them can never find its target
                    // and the tour dead-ends with no way to advance or dismiss.
                    data-tour={
                      item.label === "Dashboard" ? "tour-dashboard"
                      : item.label === "Speakers" ? "tour-program"
                      : item.label === "Event settings" ? "tour-settings"
                      : item.label === "Portal forms" ? "tour-portal"
                      : undefined
                    }
                    onClick={onNavigate}
                    className={className}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {collapsed && (
                      <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 transition-opacity group-hover:opacity-100">
                        {item.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </nav>
  );
}

function MobileSidebar({
  accountContext,
  homeHref,
  sections,
}: {
  accountContext: "admin" | "portal";
  homeHref: string;
  sections: DashboardNavSection[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="touch-target fixed left-[env(safe-area-inset-left)] top-[env(safe-area-inset-top)] z-40 flex h-14 w-14 items-center justify-center text-muted-foreground hover:text-foreground lg:hidden"
          aria-label="Open navigation"
          title="Open navigation"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-0 bg-card !px-0 !pb-[env(safe-area-inset-bottom)] !pt-[env(safe-area-inset-top)]">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-14 shrink-0 items-center px-6">
          <Link to={homeHref} className="text-sm font-semibold tracking-tight" onClick={() => setOpen(false)}>
            Namos Sessions
          </Link>
        </div>
        {accountContext === "admin" && <AdminWorkspaceMenus collapsed={false} onNavigate={() => setOpen(false)} />}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Navigation forceExpanded onNavigate={() => setOpen(false)} sections={sections} />
        </div>
        <div className="shrink-0 pt-2">
          <AccountMenu collapsed={false} context={accountContext} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DesktopSidebar({
  accountContext,
  homeHref,
  sections,
}: {
  accountContext: "admin" | "portal";
  homeHref: string;
  sections: DashboardNavSection[];
}) {
  const { collapsed, toggleCollapsed } = useSidebarState();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleCollapsed();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleCollapsed]);

  return (
    <aside
      className={cn(
        cardSurfaceClasses("default", "fixed left-2.5 top-2.5 z-30 hidden h-[calc(100dvh-20px)] flex-col lg:flex"),
        collapsed ? "w-14" : "w-48",
      )}
    >
      <div className="flex h-14 shrink-0 items-center px-3">
        {collapsed ? (
          <button
            onClick={toggleCollapsed}
            className="touch-target mx-auto rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex w-full items-center justify-between gap-2">
            <Link
              to={homeHref}
              className="truncate text-sm font-semibold tracking-tight"
            >
              Namos Sessions
            </Link>
            <button
              onClick={toggleCollapsed}
              className="touch-target rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {accountContext === "admin" && <AdminWorkspaceMenus collapsed={collapsed} />}
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Navigation sections={sections} />
      </div>
      <div className="shrink-0 pt-2">
        <AccountMenu collapsed={collapsed} context={accountContext} />
      </div>
    </aside>
  );
}

function DashboardLayoutInner({
  accountContext,
  children,
  detail,
  utility,
  forceUtilityOpen = false,
  bodyToolbar,
  homeHref,
  navSections,
  title,
  contentVariant = "default",
}: {
  accountContext: "admin" | "portal";
  children: ReactNode;
  detail?: ReactNode;
  /** A page-level utility rail, rendered beside—not inside—the content surface. */
  utility?: ReactNode;
  forceUtilityOpen?: boolean;
  bodyToolbar?: ReactNode;
  homeHref: string;
  navSections: DashboardNavSection[];
  title: string;
  contentVariant?: "default" | "conversation";
}) {
  const { collapsed } = useSidebarState();
  // Same-as-left-sidebar pattern (auto-collapsed by default, remembered across visits), but this
  // panel gets its own key — it's a per-page utility rail, not the primary nav.
  const [utilityCollapsed, setUtilityCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem("sessionboard.utilityCollapsed");
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });
  const toggleUtilityCollapsed = useCallback(() => {
    setUtilityCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem("sessionboard.utilityCollapsed", String(next));
      } catch {
        // The layout remains usable when storage is unavailable.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (forceUtilityOpen) setUtilityCollapsed(false);
  }, [forceUtilityOpen]);

  return (
    <div className="mobile-safe-shell h-dvh overflow-hidden bg-background text-foreground lg:p-0">
      <DesktopSidebar accountContext={accountContext} homeHref={homeHref} sections={navSections} />
      <MobileSidebar accountContext={accountContext} homeHref={homeHref} sections={navSections} />
      <main
        className={cn(
          "flex h-full min-w-0 flex-col overflow-hidden",
          collapsed ? "lg:pl-[4.75rem]" : "lg:pl-[13.25rem]",
          utility && (utilityCollapsed ? "lg:pr-[4.75rem]" : "lg:pr-[23.25rem] xl:pr-[25.25rem]"),
        )}
      >
        <header className="flex h-14 shrink-0 items-center gap-3 pl-14 pr-4 md:pl-16 md:pr-4 lg:px-3">
          <div className="min-w-0 flex-1"><PageHeader title={title} /></div>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 px-3 pb-3 md:px-4 md:pb-4">
          <PageContentSurface variant={contentVariant} className="min-w-0">
            <div className={cn("min-w-0 flex-1", contentVariant === "conversation" ? "flex min-h-0 overflow-hidden" : "p-4 md:p-5 lg:overflow-y-auto")}>
              {bodyToolbar && contentVariant !== "conversation" && (
                <nav aria-label="Workspace utilities" className="mb-3 flex shrink-0 items-center justify-end gap-2">
                  {bodyToolbar}
                </nav>
              )}
              {children}
            </div>
            {detail && (
              <aside className={cardSurfaceClasses("default", "order-first mb-0 w-auto shrink-0 p-4 sm:p-6 lg:order-none lg:w-[400px] lg:overflow-y-auto")}>
                {detail}
              </aside>
            )}
          </PageContentSurface>
        </div>
      </main>
      {utility && (
        <aside
          aria-label="Page utilities"
          className={cardSurfaceClasses(
            "default",
            cn(
              "fixed right-2.5 top-2.5 z-30 hidden h-[calc(100dvh-20px)] flex-col overflow-hidden lg:flex",
              utilityCollapsed ? "w-14" : "w-[22rem] xl:w-[24rem]",
            ),
          )}
        >
          <div className={cn("flex h-14 shrink-0 items-center px-3", utilityCollapsed ? "justify-center" : "justify-start")}>
            <button
              type="button"
              onClick={toggleUtilityCollapsed}
              aria-label={utilityCollapsed ? "Show page utilities" : "Hide page utilities"}
              aria-pressed={!utilityCollapsed}
              title={utilityCollapsed ? "Show panel" : "Hide panel"}
              className="touch-target rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>
          <div hidden={utilityCollapsed} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
            {utility}
          </div>
        </aside>
      )}
    </div>
  );
}

export function DashboardLayout({
  accountContext,
  children,
  detail,
  utility,
  forceUtilityOpen,
  bodyToolbar,
  homeHref,
  navSections,
  title,
  contentVariant,
}: {
  accountContext: "admin" | "portal";
  children: ReactNode;
  detail?: ReactNode;
  utility?: ReactNode;
  forceUtilityOpen?: boolean;
  bodyToolbar?: ReactNode;
  homeHref: string;
  navSections: DashboardNavSection[];
  title: string;
  contentVariant?: "default" | "conversation";
}) {
  return (
    <SidebarProvider>
      <DashboardLayoutInner accountContext={accountContext} detail={detail} utility={utility} forceUtilityOpen={forceUtilityOpen} bodyToolbar={bodyToolbar} homeHref={homeHref} navSections={navSections} title={title} contentVariant={contentVariant}>
        {children}
      </DashboardLayoutInner>
    </SidebarProvider>
  );
}

export function AppLayout({
  children,
  detail,
  utility,
  title,
  contentVariant,
}: {
  children: ReactNode;
  detail?: ReactNode;
  utility?: ReactNode;
  title: string;
  contentVariant?: "default" | "conversation";
}) {
  const current = useOptionalCurrentEvent()?.event;
  const repo = useContext(RepoContext);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [agentAccess, setAgentAccess] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  useEffect(() => {
    let active = true;
    setAgentAccess(false);
    if (!current || !repo?.agentRuns) return () => { active = false; };
    void repo.agentRuns.canUse({ eventId: current.id }).then((allowed) => { if (active) setAgentAccess(allowed); }).catch(() => { if (active) setAgentAccess(false); });
    return () => { active = false; };
  }, [current, repo]);
  useEffect(() => {
    const openVoiceAgent = () => setVoiceOpen(true);
    window.addEventListener("namos:open-voice-agent", openVoiceAgent);
    return () => window.removeEventListener("namos:open-voice-agent", openVoiceAgent);
  }, []);
  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const managedCrm = selectedBackend() === "convex";
  // "All contacts" links to the organization-wide CRM workspace (#268), not an event-scoped
  // route, so it needs `current.organizationId` in hand and must skip the `/events/:slug` prefix
  // every other nav item gets below. Legacy events with no organizationId hide the item rather
  // than link somewhere broken.
  const visibleNavSections = current ? navSections.map(section => ({ ...section, items: section.items.filter(item => (item.to !== "/program/sponsors" || current.sponsorsEnabled) && (item.to !== "/program/agent" || agentAccess) && (item.to !== "/program/speakers" || managedCrm) && (item.to !== "/program/contacts" || managedCrm) && (item.to !== "/organizations/:organizationId/contacts" || (managedCrm && current.organizationId))).map(item => ({ ...item, to: item.to.startsWith("/organizations/") ? `${item.to.replace(":organizationId", current.organizationId ?? "")}?event=${current.id}` : `/events/${current.slug}${item.to}` })) })) : repo ? [] : navSections;

  return (
    <SettingsModalProvider>
    <DashboardLayout
      accountContext="admin"
      detail={detail}
      utility={current && voiceOpen ? <VoiceSessionPanel eventId={current.id} onClose={() => setVoiceOpen(false)} /> : utility}
      forceUtilityOpen={voiceOpen}
      bodyToolbar={(
        <>
          <button
            type="button"
            onClick={openCommandPalette}
            className="touch-target hidden items-center gap-2 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground sm:flex"
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
            <kbd className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
          </button>
          <NotificationBell />
        </>
      )}
      homeHref={current ? `/events/${current.slug}/dashboard` : "/events"}
      navSections={visibleNavSections}
      title={title}
      contentVariant={contentVariant}
    >
      {children}
      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
      <GlobalKeyboardShortcuts onOpenCommandPalette={openCommandPalette} />
      <TourOverlay />
    </DashboardLayout>
    {current && agentAccess && (
      <button
        type="button"
        onClick={() => setVoiceOpen((open) => !open)}
        aria-label={voiceOpen ? "Close voice agent" : "Open voice agent"}
        aria-pressed={voiceOpen}
        title={voiceOpen ? "Close voice agent" : "Voice agent"}
        className="fixed bottom-4 right-2.5 z-50 hidden h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-card shadow-sm ring-1 ring-inset ring-black/5 lg:flex"
      >
        {voiceOpen ? <X className="h-5 w-5 text-foreground" /> : <VoiceOrb state="idle" className="h-full w-full" />}
      </button>
    )}
    </SettingsModalProvider>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
