import { useCallback, useEffect, useState } from "react";
import { Plus, RotateCw, Trash2, UserRound } from "lucide-react";
import { useUser } from "@clerk/clerk-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DetailPane } from "@/components/shared/DetailPane";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { SectionCard } from "@/components/shared/SectionCard";
import { SkeletonList } from "@/components/shared/SkeletonList";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRepo } from "@/data/repo";
import type { Event, EventInviteResult, EventMember } from "@/data/types";
import { cleanErrorMessage, friendlyErrorMessage } from "@/lib/errors";
import { EVENT_TEAM_MEMBER_LIMIT, eventTeamSeatsRemaining } from "@/lib/event-team";

function InviteEventMember({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (result?: EventInviteResult) => Promise<void>;
}) {
  const { event } = useCurrentEvent();
  const repo = useRepo();
  const [mode, setMode] = useState<"invite" | "pull">("invite");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<EventMember["role"]>("organizer");
  const [events, setEvents] = useState<Event[]>([]);
  const [sourceEventId, setSourceEventId] = useState<Event["id"] | "">("");
  const [sourceMembers, setSourceMembers] = useState<EventMember[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    void repo.events
      .listMine()
      .then((rows) => setEvents(rows.filter((row) => row.id !== event.id)))
      .catch(() => setEvents([]));
  }, [event.id, repo]);
  const chooseSource = async (value: Event["id"] | "") => {
    setSourceEventId(value);
    setSelected([]);
    if (!value) return setSourceMembers([]);
    try {
      setSourceMembers(await repo.eventMembers.list({ eventId: value }));
    } catch (cause) {
      setError(cleanErrorMessage(cause, "Could not load that team."));
    }
  };
  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await repo.eventMembers.invite({ eventId: event.id, email, role });
      await onSaved(result);
      onClose();
    } catch (cause) {
      setError(cleanErrorMessage(cause, "Could not send the invitation."));
    } finally {
      setBusy(false);
    }
  };
  const addSelected = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const members = sourceMembers.filter((member) =>
        selected.includes(member.id),
      );
      await Promise.all(
        members.map((member) =>
          repo.eventMembers.add({
            eventId: event.id,
            email: member.email,
            role: member.role,
            userId: member.userId.startsWith("pending:")
              ? undefined
              : member.userId,
          }),
        ),
      );
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cleanErrorMessage(cause, "Could not copy team members."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DetailPane title="Invite a teammate" onClose={onClose}>
      <div className="space-y-5">
        <p className="mt-1 text-sm text-muted-foreground">
          Access applies only to {event.name}.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
        <button
          type="button"
          onClick={() => setMode("invite")}
          className={`rounded px-3 py-2 text-sm font-medium ${mode === "invite" ? "bg-background" : "text-muted-foreground"}`}
        >
          Invite by email
        </button>
        <button
          type="button"
          onClick={() => setMode("pull")}
          className={`rounded px-3 py-2 text-sm font-medium ${mode === "pull" ? "bg-background" : "text-muted-foreground"}`}
        >
          Pull from event
        </button>
      </div>
      {mode === "invite" ? (
        <>
          <FormField label="Email" htmlFor="member-email" hint="We’ll send a secure, single-use Clerk invitation link.">
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </FormField>
          <FormField label="Role" hint="Organizers can manage this event; reviewers only receive review access.">
            <Select
              value={role}
              onValueChange={(value) => setRole(value as EventMember["role"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="organizer">Organizer</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={busy || !email.trim()}
            >
              {busy ? "Sending…" : "Send invitation"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <FormField label="Source event">
            <Select
              value={sourceEventId}
              onValueChange={(value) => void chooseSource(value as Event["id"])}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose an event" />
              </SelectTrigger>
              <SelectContent>
                {events.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {sourceEventId && (
            <div className={cardSurfaceClasses("default", "max-h-64 divide-y divide-muted overflow-y-auto bg-muted/40")}>
              {sourceMembers.length ? (
                sourceMembers.map((member) => (
                  <label
                    key={member.id}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm"
                  >
                    <Checkbox
                      checked={selected.includes(member.id)}
                      onCheckedChange={(checked) =>
                        setSelected((current) =>
                          checked === true
                            ? [...current, member.id]
                            : current.filter((id) => id !== member.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {member.email}
                    </span>
                    <span className="text-xs capitalize text-muted-foreground">
                      {member.role}
                    </span>
                  </label>
                ))
              ) : (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  That event has no event-specific members.
                </p>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => void addSelected()}
              disabled={busy || selected.length === 0}
            >
              {busy ? "Adding…" : `Add selected (${selected.length})`}
            </Button>
          </div>
        </>
      )}
    </DetailPane>
  );
}

export default function EventTeam() {
  const { event } = useCurrentEvent();
  const { user } = useUser();
  const repo = useRepo();
  const [members, setMembers] = useState<EventMember[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [inviting, setInviting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "warning"; message: string }>();
  const [remove, setRemove] = useState<EventMember>();
  const [workingMemberId, setWorkingMemberId] = useState<string>();
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [rows, organizer] = await Promise.all([
        repo.eventMembers.list({ eventId: event.id }),
        repo.organizers.getMine().catch(() => null),
      ]);
      const email = user?.primaryEmailAddress?.emailAddress
        .trim()
        .toLowerCase();
      setMembers(rows);
      setCanManage(
        Boolean(organizer) ||
          rows.some(
            (member) =>
              member.role === "organizer" &&
              (member.userId === user?.id || member.email === email),
          ),
      );
    } catch (cause) {
      setError(cleanErrorMessage(cause, "Could not load event team."));
    } finally {
      setLoading(false);
    }
  }, [event.id, repo, user?.id, user?.primaryEmailAddress?.emailAddress]);
  useEffect(() => {
    void load();
  }, [load]);
  const confirmRemove = async () => {
    if (!remove) return;
    setWorkingMemberId(remove.id);
    setError(undefined);
    try {
      await repo.eventMembers.remove({
        eventId: event.id,
        memberId: remove.id,
      });
      setFeedback({
        tone: "success",
        message: remove.userId.startsWith("pending:")
          ? "Invitation revoked and removed."
          : "Event access removed.",
      });
      setRemove(undefined);
      await load();
    } catch (cause) {
      setError(friendlyErrorMessage(cause, "Could not remove event member."));
    } finally {
      setWorkingMemberId(undefined);
    }
  };
  const resendInvite = async (member: EventMember) => {
    setWorkingMemberId(member.id);
    setError(undefined);
    setFeedback(undefined);
    try {
      const result = await repo.eventMembers.resend({ eventId: event.id, memberId: member.id });
      setFeedback(
        result.emailSent && !result.warning
          ? { tone: "success", message: "Invitation resent with a fresh Clerk link." }
          : {
              tone: "warning",
              message: result.warning || "The invitation was refreshed, but email delivery could not be confirmed.",
            },
      );
      await load();
    } catch (cause) {
      setError(cleanErrorMessage(cause, "Could not resend the invitation."));
    } finally {
      setWorkingMemberId(undefined);
    }
  };
  const seatsRemaining = eventTeamSeatsRemaining(members.length);
  const handleInvited = async (result?: EventInviteResult) => {
    if (result) {
      setFeedback(
        result.emailSent && !result.warning
          ? { tone: "success", message: result.status === "active" ? "The teammate was added and notified." : "Invitation sent." }
          : {
              tone: "warning",
              message: result.warning || "The invitation was saved, but email delivery could not be confirmed.",
            },
      );
    }
    await load();
  };
  return (
    <AppLayout
      title="Event team"
      detail={
        inviting ? (
          <InviteEventMember
            onClose={() => setInviting(false)}
            onSaved={handleInvited}
          />
        ) : undefined
      }
    >
      <div className="space-y-5">
        <ContentToolbar
          ariaLabel="Event team controls"
          search={
            <div>
              <h2 className="text-base font-semibold">{event.name}</h2>
              <p className="text-sm text-muted-foreground">
                Event-scoped organizers and reviewers · {members.length} of {EVENT_TEAM_MEMBER_LIMIT} seats used.
              </p>
            </div>
          }
          primaryAction={
            canManage ? (
              <Button onClick={() => setInviting(true)} disabled={seatsRemaining === 0}>
                <Plus className="mr-2 h-4 w-4" />
                {seatsRemaining === 0 ? "Team full" : "Invite teammate"}
              </Button>
            ) : undefined
          }
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {feedback && (
          <p
            role="status"
            className={feedback.tone === "success" ? "text-sm text-foreground" : "text-sm text-amber-700 dark:text-amber-300"}
          >
            {feedback.message}
          </p>
        )}
        {loading ? (
          <SkeletonList rows={4} label="Loading event team…" />
        ) : members.length ? (
          <SectionCard
            title="Team members"
            description="Pending invitations can be resent or revoked here. Accepted members can be removed from this event."
            contentClassName="divide-y divide-muted"
          >
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-4 px-4 py-3"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-background">
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.userId.startsWith("pending:")
                      ? member.inviteEmailStatus === "failed"
                        ? "Pending · email needs attention"
                        : member.inviteEmailStatus === "sent"
                          ? "Pending · invitation sent"
                          : "Invitation pending"
                      : "Accepted"}
                  </p>
                </div>
                <span className="rounded-md bg-background px-2 py-1 text-xs font-medium capitalize">
                  {member.role}
                </span>
                {canManage && (
                  <div className="flex items-center gap-1">
                    {member.userId.startsWith("pending:") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={Boolean(workingMemberId)}
                        onClick={() => void resendInvite(member)}
                      >
                        <RotateCw className={`mr-2 h-4 w-4 ${workingMemberId === member.id ? "animate-spin" : ""}`} />
                        Resend
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={Boolean(workingMemberId)}
                      aria-label={`${member.userId.startsWith("pending:") ? "Revoke invitation for" : "Remove"} ${member.email}`}
                      onClick={() => setRemove(member)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </SectionCard>
        ) : (
          <EmptyState message="No event-specific members yet. Organization owners and admins still have access." />
        )}
      </div>
      <AlertDialog
        open={Boolean(remove)}
        onOpenChange={(open) => {
          if (!open) setRemove(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {remove?.userId.startsWith("pending:") ? "Revoke invitation?" : "Remove event access?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {remove?.userId.startsWith("pending:")
                ? `The Clerk invitation for ${remove.email} will be revoked and its link will stop working.`
                : `${remove?.email} will no longer be able to open ${event.name} through this membership.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={Boolean(workingMemberId)} onClick={() => void confirmRemove()}>
              {remove?.userId.startsWith("pending:") ? "Revoke invitation" : "Remove access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
