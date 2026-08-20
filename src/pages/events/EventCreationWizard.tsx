import { useMemo, useState } from "react";
import { TemplateGallery } from "@/components/forms/TemplateGallery";
import { CharCounterInput } from "@/components/shared/CharCounterInput";
import { WizardShell, type WizardStep } from "@/components/shared/WizardShell";
import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
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
import type { Event, EventId, EventMember } from "@/data/types";
import { cleanErrorMessage } from "@/lib/errors";
import { getBrowserTimezone, getTimezoneOptions } from "@/lib/timezones";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const dateValue = (timestamp: number) =>
  new Date(timestamp).toISOString().slice(0, 10);
const timestamp = (value: string) => new Date(`${value}T12:00:00Z`).getTime();
const steps: WizardStep[] = [
  { id: "basics", label: "Basics" },
  { id: "cfp", label: "CFP" },
  { id: "branding", label: "Branding" },
  { id: "team", label: "Team" },
  { id: "review", label: "Review" },
];
type Invite = { email: string; role: EventMember["role"] };

export function EventCreationWizard({
  onClose,
  onSaved,
  events,
}: {
  onClose: () => void;
  onSaved: (eventId: string, slug: string, formId?: string) => void;
  events: Event[];
}) {
  const repo = useRepo();
  const [activeStep, setActiveStep] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [startDate, setStartDate] = useState(dateValue(Date.now()));
  const [endDate, setEndDate] = useState(dateValue(Date.now() + 86_400_000));
  const [timezone, setTimezone] = useState(getBrowserTimezone() || "UTC");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("");
  const [theme, setTheme] = useState("");
  const [originalTheme, setOriginalTheme] = useState("");
  const [eventId, setEventId] = useState<EventId>();
  const [formId, setFormId] = useState<string>();
  const [cfpChoice, setCfpChoice] = useState<"yes" | "skip">("skip");
  const [cfpPicker, setCfpPicker] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [teamSourceId, setTeamSourceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const timezoneOptions = useMemo(
    () => getTimezoneOptions(timezone),
    [timezone],
  );

  const eventFields = () => ({
    name: name.trim(),
    slug: slugify(slug),
    timezone,
    startDate: timestamp(startDate),
    endDate: timestamp(endDate),
    location: location.trim() || undefined,
    type: type.trim() || undefined,
    exhibitorsEnabled: false,
    sponsorsEnabled: false,
    status: "draft" as const,
  });
  const goNext = async () => {
    setError(undefined);
    if (activeStep === 0) {
      const fields = eventFields();
      if (!fields.name || !fields.slug)
        return setError("Name and slug are required.");
      if (
        !Number.isFinite(fields.startDate) ||
        !Number.isFinite(fields.endDate) ||
        fields.startDate >= fields.endDate
      )
        return setError("End date must be after start date.");
      setBusy(true);
      try {
        const id = await repo.events.save(fields);
        setEventId(id);
        setActiveStep(1);
      } catch (cause) {
        setError(cleanErrorMessage(cause, "Could not save event."));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (activeStep === 1) {
      if (cfpChoice === "yes" && !formId && !cfpPicker) {
        setCfpPicker(true);
        return;
      }
      setActiveStep(2);
      return;
    }
    if (activeStep === 2) {
      if (!eventId) return setError("Create the event before saving branding.");
      if (theme !== originalTheme) {
        setBusy(true);
        try {
          await repo.events.save({
            ...eventFields(),
            id: eventId,
            theme: theme || undefined,
          });
          setOriginalTheme(theme);
        } catch (cause) {
          setError(cleanErrorMessage(cause, "Could not save branding."));
          setBusy(false);
          return;
        } finally {
          setBusy(false);
        }
      }
      setActiveStep(3);
      return;
    }
    if (activeStep === 3) {
      if (!eventId) return setError("Create the event before adding a team.");
      setBusy(true);
      try {
        for (const invite of invites.filter((item) => item.email.trim()))
          await repo.eventMembers.add({
            eventId,
            email: invite.email.trim(),
            role: invite.role,
          });
        if (teamSourceId) {
          const members = await repo.eventMembers.list({
            eventId: teamSourceId as EventId,
          });
          const existingEmails = new Set(
            (await repo.eventMembers.list({ eventId })).map((member) =>
              member.email.trim().toLowerCase(),
            ),
          );
          for (const member of members) {
            if (existingEmails.has(member.email.trim().toLowerCase())) continue;
            await repo.eventMembers.add({
              eventId,
              email: member.email,
              role: member.role,
              userId: member.userId,
            });
          }
        }
        setActiveStep(4);
      } catch (cause) {
        setError(cleanErrorMessage(cause, "Could not update the event team."));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!eventId) return setError("The event was not created.");
    onSaved(eventId, slugify(slug), formId);
  };
  const selectTemplate = async (templateId: string) => {
    if (!eventId) throw new Error("Create an event before creating a CFP.");
    const id = await repo.forms.createFromTemplate(templateId, eventId);
    setFormId(id);
    setCfpPicker(false);
    setActiveStep(2);
  };
  const content =
    activeStep === 0 ? (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Event basics</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set up the details organizers and attendees need first.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wizard-event-name">Name</Label>
          <Input
            id="wizard-event-name"
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wizard-event-slug">URL slug</Label>
          <Input
            id="wizard-event-slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
          />
          <p className="text-xs text-muted-foreground">
            /events/{slugify(slug) || "event-name"}
          </p>
        </div>
        <div className="grid gap-3">
          <div className="space-y-2">
            <Label htmlFor="wizard-start">Starts</Label>
            <Input
              id="wizard-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wizard-end">Ends</Label>
            <Input
              id="wizard-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezoneOptions.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3">
          <div className="space-y-2">
            <Label htmlFor="wizard-location">Location</Label>
            <Input
              id="wizard-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wizard-type">Type</Label>
            <Input
              id="wizard-type"
              placeholder="Conference"
              value={type}
              onChange={(e) => setType(e.target.value)}
            />
          </div>
        </div>
      </div>
    ) : activeStep === 1 ? (
      cfpPicker ? (
        <TemplateGallery
          appliesTo="cfp"
          onSelect={selectTemplate}
          onBlank={() => {
            setCfpPicker(false);
            setActiveStep(2);
          }}
          onCancel={() => setCfpPicker(false)}
        />
      ) : (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Add a CFP?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You can start collecting proposals now or add a form later.
            </p>
          </div>
          <div className="grid gap-4">
            {(["yes", "skip"] as const).map((choice) => (
              <Button
                type="button"
                variant="ghost"
                key={choice}
                onClick={() => setCfpChoice(choice)}
                className={`h-auto rounded-lg p-5 text-left ${cfpChoice === choice ? "bg-muted" : "hover:bg-muted/60"}`}
              >
                <span>
                  <span className="block font-semibold">
                    {choice === "yes" ? "Yes, add a CFP now" : "Skip for now"}
                  </span>
                  <span className="mt-2 block text-sm font-normal text-muted-foreground">
                    {choice === "yes"
                      ? "Choose a template and continue in the CFP builder."
                      : "You can add a CFP later from Program."}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </div>
      )
    ) : activeStep === 2 ? (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Branding</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a theme description now, or leave this for later.
          </p>
        </div>
        <Label htmlFor="wizard-theme">Theme</Label>
        <CharCounterInput
          id="wizard-theme"
          value={theme}
          maxLength={1000}
          onChange={setTheme}
        />
      </div>
    ) : activeStep === 3 ? (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Team</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite collaborators or copy a team from another event.
          </p>
        </div>
        <div className="space-y-3">
          <p className="font-medium">Invite by email</p>
          {invites.map((invite, index) => (
            <div className="flex flex-wrap gap-2" key={index}>
              <Input
                className="min-w-52 flex-1"
                type="email"
                placeholder="name@example.com"
                value={invite.email}
                onChange={(e) =>
                  setInvites((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, email: e.target.value } : item,
                    ),
                  )
                }
              />
              <Select
                value={invite.role}
                onValueChange={(role: EventMember["role"]) =>
                  setInvites((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, role } : item,
                    ),
                  )
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="organizer">Organizer</SelectItem>
                  <SelectItem value="reviewer">Reviewer</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setInvites((current) => current.filter((_, i) => i !== index))
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="link"
            className="px-0"
            onClick={() =>
              setInvites((current) => [
                ...current,
                { email: "", role: "reviewer" },
              ])
            }
          >
            Add another
          </Button>
        </div>
        {events.length > 0 && (
          <div className="space-y-2">
            <Label>Or copy team from an existing event</Label>
            <Select
              value={teamSourceId || "none"}
              onValueChange={(value) =>
                setTeamSourceId(value === "none" ? "" : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose an event" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Do not copy a team</SelectItem>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    ) : (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Check your setup before finishing.
          </p>
        </div>
        {[
          ["Basics", `${name} · /events/${slugify(slug)} · ${timezone}`, 0],
          [
            "CFP",
            formId
              ? "CFP created — builder opens after finishing"
              : "No CFP yet — you can add one from Program",
            1,
          ],
          ["Branding", theme || "No theme added", 2],
          [
            "Team",
            invites
              .filter((invite) => invite.email.trim())
              .map((invite) => invite.email)
              .join(", ") ||
              (teamSourceId
                ? "Team copied from an existing event"
                : "No additional team members"),
            3,
          ],
        ].map(([label, value, step]) => (
          <div className="rounded-lg border p-4" key={String(label)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{value}</p>
              </div>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => setActiveStep(Number(step))}
              >
                Edit
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  return (
    <section className={cardSurfaceClasses("default", "mx-auto max-w-4xl p-6")} aria-label="New event">
      <WizardShell
        layout="stack"
        steps={steps}
        activeStep={activeStep}
        onStepChange={(step) => step <= activeStep && setActiveStep(step)}
        onBack={() => setActiveStep(Math.max(0, activeStep - 1))}
        onNext={() => void goNext()}
        finalLabel="Finish"
        footerStart={
          activeStep === 2 || activeStep === 3 ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              disabled={busy}
              onClick={() => {
                setError(undefined);
                setActiveStep(activeStep + 1);
              }}
            >
              Skip
            </Button>
          ) : undefined
        }
      >
        {content}
        {error && (
          <p role="alert" className="mt-5 text-sm text-destructive">
            {error}
          </p>
        )}
        {busy && activeStep === 0 && (
          <p className="text-sm text-muted-foreground">Creating…</p>
        )}
      </WizardShell>
    </section>
  );
}
