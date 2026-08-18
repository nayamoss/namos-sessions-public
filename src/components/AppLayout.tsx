import { useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  CalendarClock,
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  ClipboardCheck,
  ClipboardList,
  FileText,
  ListTodo,
  Megaphone,
  Mail,
  PanelLeft,
  Search,
  Settings2,
  Tags,
  Users,
  ShieldCheck,
  KeyRound,
  Handshake,
  Bot,
  Code2,
  BarChart3,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import { useOptionalSettingsModal } from "@/components/settings/SettingsModalContext";
import { settingsTabFromPath } from "@/components/settings/settings-nav";

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
      { to: "/program/speakers", label: "Speakers", icon: Users },
      { to: "/program/agenda", label: "Schedule", icon: CalendarDays },
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
    ],
  },
  // Running the event day-to-day, as opposed to configuring how it's set up
  // (that split lives in "Settings" below).
  {
    label: "Operations",
    items: [
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/program/agent", label: "Operations Agent", icon: Bot },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/settings/event", label: "Event settings", icon: Settings2 },
      { to: "/settings/team", label: "Event team", icon: Users },
      { to: "/settings/library", label: "Library", icon: Tags },
      { to: "/settings/task-templates", label: "Task templates", icon: ClipboardList },
      { to: "/settings/integrations", label: "Integrations", icon: Mail },
      { to: "/cms/embeds", label: "Embeds", icon: Code2 },
      { to: "/settings/api", label: "API", icon: KeyRound },
      { to: "/settings/activity", label: "Activity", icon: Activity },
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
  const settingsModal = useOptionalSettingsModal();
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

  return (
    <nav className={cn("space-y-6 py-4", collapsed ? "px-2" : "px-3")}>
      {sections.map((section) => {
        const isCollapsible = section.items.length > 1;
        const hasActiveItem = section.items.some((item) =>
          item.end
            ? location.pathname === item.to
            : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
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
                    className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-foreground/65 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                const settingsTab = settingsTabFromPath(item.to);
                const active = item.end
                  ? location.pathname === item.to
                  : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
                const className = cn(
                  "touch-target group relative flex items-center rounded-md text-base font-medium transition-colors",
                  collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
                  active ? "bg-muted text-foreground" : "text-foreground/75 hover:bg-muted hover:text-foreground",
                );
                if (settingsTab && settingsModal) return (
                  <button key={item.to} type="button" title={collapsed ? item.label : undefined} aria-label={item.label} onClick={() => { settingsModal.openSettings(settingsTab); onNavigate?.(); }} className={className}>
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
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
        collapsed ? "w-14" : "w-56",
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
      <div className="min-h-0 flex-1 overflow-y-auto">
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
  headerEnd,
  homeHref,
  navSections,
  title,
}: {
  accountContext: "admin" | "portal";
  children: ReactNode;
  detail?: ReactNode;
  /** A page-level utility rail, rendered beside—not inside—the content surface. */
  utility?: ReactNode;
  headerEnd?: ReactNode;
  homeHref: string;
  navSections: DashboardNavSection[];
  title: string;
}) {
  const { collapsed } = useSidebarState();

  return (
    <div className="mobile-safe-shell h-dvh overflow-hidden bg-background text-foreground lg:p-0">
      <DesktopSidebar accountContext={accountContext} homeHref={homeHref} sections={navSections} />
      <MobileSidebar accountContext={accountContext} homeHref={homeHref} sections={navSections} />
      <main
        className={cn(
          "flex h-full min-w-0 flex-col overflow-hidden",
          collapsed ? "lg:pl-[4.75rem]" : "lg:pl-[15.25rem]",
          utility && "lg:pr-[23.75rem] xl:pr-[25.75rem]",
        )}
      >
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 pl-14 pr-4 md:pl-16 md:pr-4 lg:px-3">
          <div className="min-w-0"><PageHeader title={title} /></div>
          {headerEnd && (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {headerEnd}
            </div>
          )}
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 px-3 pb-3 md:px-4 md:pb-4">
          <PageContentSurface className="min-w-0">
            <div className="min-w-0 flex-1 p-4 md:p-5 lg:overflow-y-auto">
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
            "fixed right-2.5 top-2.5 z-30 hidden h-[calc(100dvh-20px)] w-[22rem] flex-col overflow-y-auto p-4 sm:p-6 lg:flex xl:w-[24rem]",
          )}
        >
          {utility}
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
  headerEnd,
  homeHref,
  navSections,
  title,
}: {
  accountContext: "admin" | "portal";
  children: ReactNode;
  detail?: ReactNode;
  utility?: ReactNode;
  headerEnd?: ReactNode;
  homeHref: string;
  navSections: DashboardNavSection[];
  title: string;
}) {
  return (
    <SidebarProvider>
      <DashboardLayoutInner accountContext={accountContext} detail={detail} utility={utility} headerEnd={headerEnd} homeHref={homeHref} navSections={navSections} title={title}>
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
}: {
  children: ReactNode;
  detail?: ReactNode;
  utility?: ReactNode;
  title: string;
}) {
  const current = useOptionalCurrentEvent()?.event;
  const repo = useContext(RepoContext);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [agentAccess, setAgentAccess] = useState(false);
  useEffect(() => {
    let active = true;
    setAgentAccess(false);
    if (!current || !repo?.agentRuns) return () => { active = false; };
    void repo.agentRuns.canUse({ eventId: current.id }).then((allowed) => { if (active) setAgentAccess(allowed); }).catch(() => { if (active) setAgentAccess(false); });
    return () => { active = false; };
  }, [current, repo]);
  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const visibleNavSections = current ? navSections.map(section => ({ ...section, items: section.items.filter(item => (item.to !== "/program/sponsors" || current.sponsorsEnabled) && (item.to !== "/program/agent" || agentAccess)).map(item => ({ ...item, to: `/events/${current.slug}${item.to}` })) })) : repo ? [] : navSections;

  return (
    <SettingsModalProvider>
    <DashboardLayout
      accountContext="admin"
      detail={detail}
      utility={utility}
      headerEnd={(
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
    >
      {children}
      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
      <GlobalKeyboardShortcuts onOpenCommandPalette={openCommandPalette} />
      <TourOverlay />
    </DashboardLayout>
    </SettingsModalProvider>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
