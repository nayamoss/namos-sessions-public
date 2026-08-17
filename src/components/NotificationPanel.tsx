import { Component, useMemo, type ErrorInfo, type ReactNode } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, ClipboardCheck, FileText, UserPlus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type Notification = Doc<"notifications">;

const iconForKind: Record<Notification["kind"], typeof Bell> = {
  invite_sent: UserPlus,
  invite_accepted: UserPlus,
  invite_declined: UserPlus,
  member_removed: UserPlus,
  submission_received: FileText,
  submission_withdrawn: FileText,
  reviewer_assigned: ClipboardCheck,
  evaluation_completed: ClipboardCheck,
  decision_sent: ClipboardCheck,
  comms_delivery_failed: AlertTriangle,
};

class NotificationPanelErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Convex query failures are rendered locally so the shell remains usable.
  }

  render() {
    return this.state.hasError
      ? <p className="p-3 text-sm text-red-600">Couldn't load notifications</p>
      : this.props.children;
  }
}

export function NotificationPanel({ onClose }: { onClose: () => void }) {
  return <NotificationPanelErrorBoundary><NotificationPanelContent onClose={onClose} /></NotificationPanelErrorBoundary>;
}

function NotificationPanelContent({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { results, status } = usePaginatedQuery(api.notifications.list, {}, { initialNumItems: 20 });
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const unreadCount = useMemo(() => results.filter((notification) => !notification.readAt).length, [results]);

  const openNotification = async (notification: Notification) => {
    if (!notification.readAt) void markRead({ notificationId: notification._id });
    onClose();
    if (notification.linkPath) navigate(notification.linkPath);
  };

  return (
    <section aria-label="Notifications" className="w-full">
      <div className="flex items-center justify-between px-2 py-2">
        <h2 className="text-sm font-semibold">Notifications</h2>
        {unreadCount > 0 && (
          <button type="button" onClick={() => void markAllRead({})} className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Mark all read
          </button>
        )}
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="space-y-1" aria-label="Loading notifications">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-14 animate-pulse rounded-[10px] bg-muted" />)}
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[12px] bg-muted p-8 text-center">
          <Bell size={40} className="mb-3 text-muted-foreground" />
          <p className="text-sm font-semibold">You're all caught up</p>
          <p className="mt-1 text-sm text-muted-foreground">New activity on your events will show up here</p>
        </div>
      ) : (
        <div className="max-h-[420px] space-y-1 overflow-y-auto" role="list">
          {results.map((notification) => {
            const Icon = iconForKind[notification.kind];
            const unread = !notification.readAt;
            return (
              <button
                key={notification._id}
                type="button"
                role="listitem"
                onClick={() => void openNotification(notification)}
                className="group flex w-full items-start gap-3 rounded-[10px] p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex w-2 shrink-0 items-start pt-1.5">
                  {unread && <span className="h-2 w-2 rounded-full bg-info" aria-label="Unread" />}
                </span>
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground", notification.kind === "comms_delivery_failed" && "text-red-600")} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm", unread ? "font-semibold" : "font-normal")}>{notification.title}</span>
                  {notification.body && <span className="block truncate text-sm text-muted-foreground">{notification.body}</span>}
                  <span className="mt-1 block text-xs text-muted-foreground">{formatDistanceToNow(notification.createdAt, { addSuffix: true })}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
