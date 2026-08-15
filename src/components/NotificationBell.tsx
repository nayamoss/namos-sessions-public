import { Bell } from "lucide-react";

// Notification persistence is event-scoped and lands with the organizer inbox. Keep this
// harmless indicator here so the shell has no dependency on the retired Kanrei org hooks.
export function NotificationBell() {
  return <button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Notifications" title="Notifications"><Bell className="h-4 w-4" /></button>;
}
