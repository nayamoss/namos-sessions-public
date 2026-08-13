import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, UserRound } from "lucide-react";
import { useUser } from "@clerk/clerk-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRepo } from "@/data/repo";
import type { Event, EventMember } from "@/data/types";
import { cleanErrorMessage } from "@/lib/errors";

function InviteEventMember({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { event } = useCurrentEvent();
  const repo = useRepo();
  const [mode, setMode] = useState<"invite" | "pull">("invite");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<EventMember["role"]>("reviewer");
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
      await repo.eventMembers.add({ eventId: event.id, email, role });
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cleanErrorMessage(cause, "Could not add event member."));
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
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Add event member</h2>
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
          <div className="space-y-2">
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
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
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={busy || !email.trim()}
            >
              {busy ? "Adding…" : "Add member"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label>Source event</Label>
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
          </div>
          {sourceEventId && (
            <div className="max-h-64 divide-y divide-muted overflow-y-auto rounded-lg bg-muted/40">
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
    </div>
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
  const [remove, setRemove] = useState<EventMember>();
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
    try {
      await repo.eventMembers.remove({
        eventId: event.id,
        userId: remove.userId,
      });
      setRemove(undefined);
      await load();
    } catch (cause) {
      setError(cleanErrorMessage(cause, "Could not remove event member."));
    }
  };
  return (
    <AppLayout
      title="Event team"
      detail={
        inviting ? (
          <InviteEventMember
            onClose={() => setInviting(false)}
            onSaved={load}
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
                Event-scoped organizers and reviewers.
              </p>
            </div>
          }
          primaryAction={
            canManage ? (
              <Button onClick={() => setInviting(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add member
              </Button>
            ) : undefined
          }
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <SkeletonList rows={4} label="Loading event team…" />
        ) : members.length ? (
          <div className="divide-y divide-muted rounded-lg bg-muted/40">
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
                      ? "Invitation pending"
                      : "Active"}
                  </p>
                </div>
                <span className="rounded-md bg-background px-2 py-1 text-xs font-medium capitalize">
                  {member.role}
                </span>
                {canManage && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${member.email}`}
                    onClick={() => setRemove(member)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
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
            <AlertDialogTitle>Remove event access?</AlertDialogTitle>
            <AlertDialogDescription>
              {remove?.email} will no longer be able to open {event.name}{" "}
              through this membership.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRemove()}>
              Remove access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
