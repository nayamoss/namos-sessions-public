import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { CalendarClock, CalendarDays, FileText, Home, ListTodo, UserRound } from "lucide-react";
import { DashboardLayout, type DashboardNavSection } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { usePortalIdentity } from "./PortalIdentity";

const portalNavigation: DashboardNavSection[] = [
  {
    label: "Speaker portal",
    items: [
      { to: "/portal", label: "Home", icon: Home, end: true },
      { to: "/portal/submissions", label: "Submissions", icon: FileText },
      { to: "/portal/profile", label: "Profile", icon: UserRound },
      { to: "/portal/availability", label: "Availability", icon: CalendarClock },
      { to: "/portal/schedule", label: "Schedule", icon: CalendarDays },
      { to: "/portal/tasks", label: "Tasks", icon: ListTodo },
    ],
  },
];

function portalTitle(pathname: string) {
  if (pathname.includes("/submissions/") && pathname.endsWith("/edit")) return "Edit submission";
  if (pathname.startsWith("/portal/submissions")) return "My submissions";
  if (pathname.startsWith("/portal/profile")) return "Profile";
  if (pathname.startsWith("/portal/availability")) return "Availability";
  if (pathname.startsWith("/portal/schedule")) return "Schedule";
  if (pathname.startsWith("/portal/tasks")) return "Tasks";
  if (pathname.startsWith("/portal/forms")) return "Task form";
  return "Home";
}

export function PortalLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { eventName, selectedSpeaker, loading, error, identityLockedByClerk, handoffMismatch } = usePortalIdentity();
  const [mismatchDismissed, setMismatchDismissed] = useState(false);

  return (
    <DashboardLayout
      accountContext="portal"
      homeHref="/portal"
      navSections={portalNavigation}
      title={portalTitle(location.pathname)}
    >
      <div className="min-w-0 space-y-4 overflow-x-hidden">
        {handoffMismatch && !mismatchDismissed && selectedSpeaker && (
          <section role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted p-4">
            <p className="text-sm">You’re viewing the portal as {selectedSpeaker.name} — your recent submission isn’t shown here because you’re signed in as a different speaker.</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMismatchDismissed(true)}>Dismiss</Button>
          </section>
        )}
        {/* Once the signed-in account resolves to a speaker, that identity is authoritative and
            this notice stays hidden. It only appears for accounts that don't match a speaker. */}
        {!identityLockedByClerk && (
          <section className="rounded-lg bg-muted p-4" aria-label="No linked speaker profile">
            <p className="text-sm font-medium">No speaker profile found</p>
            {error ? (
              <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>
            ) : loading ? (
              <SkeletonList rows={1} label="Checking your speaker access…" />
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                We couldn't find a speaker profile linked to your account for {eventName ?? "this event"}. Contact the event organizer to get your account connected.
              </p>
            )}
          </section>
        )}
        {children}
      </div>
    </DashboardLayout>
  );
}
