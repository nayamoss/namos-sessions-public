import { Component, useContext, useState, type ErrorInfo, type ReactNode } from "react";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ReactiveContext, useRepoQuery } from "@/data/reactive";
import { NotificationPanel } from "@/components/NotificationPanel";

function BellTrigger({ unreadCount }: { unreadCount?: number }) {
  return (
    <PopoverTrigger asChild>
      <button
        type="button"
        className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount !== undefined && unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-info px-1 text-[10px] font-semibold leading-none text-info-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </PopoverTrigger>
  );
}

/**
 * The bell is shell chrome on every page, so a failing unread-count query must
 * not be allowed to blank the whole app — which is exactly what happens when the
 * backend has no notifications functions deployed yet. Degrade to the inert
 * bell instead. (NotificationPanel guards itself the same way.)
 */
class NotificationBellErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.warn("Notification bell unavailable:", error.message);
  }

  render() {
    if (this.state.hasError) return <Popover><BellTrigger /></Popover>;
    return this.props.children;
  }
}

function LiveBell() {
  const [open, setOpen] = useState(false);
  // Read through the repo layer rather than convex/react directly. This bell is
  // shell chrome on every page, so a direct useQuery would make the entire app —
  // and every test that mounts AppLayout — require a live ConvexProvider.
  const unreadCount = useRepoQuery<number>("notifications.unreadCount", {}).data;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <BellTrigger unreadCount={unreadCount} />
      <PopoverContent align="end" sideOffset={8} className="w-[min(380px,calc(100vw-2rem))] rounded-[12px] border-0 p-2 shadow-none">
        <NotificationPanel onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Renders the bell either way. Without a reactive transport there is no count to
 * read and no panel to open, but the control still belongs in the shell — so
 * this renders the inert trigger rather than throwing or rendering nothing.
 * Split in two so neither component calls hooks conditionally.
 */
export function NotificationBell() {
  const transport = useContext(ReactiveContext);
  if (!transport) return <Popover><BellTrigger /></Popover>;
  return (
    <NotificationBellErrorBoundary>
      <LiveBell />
    </NotificationBellErrorBoundary>
  );
}
