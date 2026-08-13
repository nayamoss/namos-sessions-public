import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { CalendarClock, CalendarDays, FileText, Home, ListTodo, UserRound } from "lucide-react";
import { DashboardLayout, type DashboardNavSection } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const { eventName, speakers, selectedSpeaker, loading, error, selectSpeaker, identityLockedByClerk, handoffMismatch } = usePortalIdentity();
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
            this picker stays hidden — it exists only for accounts that don't match a speaker yet. */}
        {!identityLockedByClerk && (
          <section className="rounded-lg bg-muted p-4" aria-label="Demo speaker selection">
            <p className="text-sm font-medium">Demo impersonation</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We couldn't match your signed-in account to a speaker for {eventName ?? "this event"}. Select one to continue.
            </p>
            {error ? (
              <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>
            ) : loading ? (
              <SkeletonList rows={1} label="Loading available speakers…" />
            ) : speakers.length ? (
              <div className="mt-3 max-w-sm space-y-2">
                <Label htmlFor="portal-speaker">Speaker</Label>
                <Select value={selectedSpeaker?.id} onValueChange={selectSpeaker}>
                  <SelectTrigger id="portal-speaker"><SelectValue placeholder="Choose a speaker" /></SelectTrigger>
                  <SelectContent>
                    {speakers.map((speaker) => <SelectItem key={speaker.id} value={speaker.id}>{speaker.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No speakers are available for this event yet.</p>
            )}
          </section>
        )}
        {children}
      </div>
    </DashboardLayout>
  );
}
