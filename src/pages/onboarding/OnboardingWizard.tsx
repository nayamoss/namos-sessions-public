import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { Link, useNavigate } from "react-router-dom";
import { PublicLayout } from "@/components/PublicLayout";
import { WizardShell } from "@/components/shared/WizardShell";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { EmailIntegrationForm } from "@/components/shared/EmailIntegrationForm";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRepo } from "@/data/repo";
import type { Event } from "@/data/types";
import { parseDateTimeLocalValue, toDateTimeLocalValue } from "@/lib/datetime";
import { cleanErrorMessage } from "@/lib/errors";
import { ImportDataStep } from "./steps/ImportDataStep";

const steps = [
  { id: "welcome", label: "Welcome" },
  { id: "conference", label: "Your conference" },
  { id: "email", label: "Connect email" },
  { id: "import", label: "Import data" },
];
const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "my-conference";
const blankEvent = (): Omit<Event, "id"> => ({
  name: "",
  slug: "",
  type: "Conference",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  startDate: Date.now(),
  endDate: Date.now() + 86_400_000,
  exhibitorsEnabled: false,
  sponsorsEnabled: false,
  status: "draft",
});

export default function OnboardingWizard() {
  const repo = useRepo();
  const navigate = useNavigate();
  const { user } = useUser();
  const [step, setStep] = useState(0);
  const [event, setEvent] = useState<Omit<Event, "id"> & { id?: Event["id"] }>(
    blankEvent,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [slugTouched, setSlugTouched] = useState(false);
  const [organizerExists, setOrganizerExists] = useState(false);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    "";
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [organizer, events, canClaimOwner] = await Promise.all([
        repo.organizers.getMine(),
        repo.events.listMine().catch(() => []),
        repo.organizers.canClaimOwner(),
      ]);
      setOrganizerExists(Boolean(organizer));
      setAccessBlocked(!organizer && events.length === 0 && !canClaimOwner);
      const firstEvent = events.at(0);
      if (firstEvent) {
        setEvent(firstEvent);
        setSlugTouched(true);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load onboarding.",
      );
    } finally {
      setLoading(false);
    }
  }, [repo]);
  useEffect(() => {
    void load();
  }, [load]);
  const update = (patch: Partial<typeof event>) =>
    setEvent((current) => ({ ...current, ...patch }));
  const complete = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await repo.organizers.completeOnboarding();
      navigate("/", { replace: true });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not finish onboarding.",
      );
    } finally {
      setBusy(false);
    }
  };
  const next = async () => {
    setError(undefined);
    if (step === 0) {
      if (!organizerExists) {
        setBusy(true);
        try {
          await repo.organizers.claimOwner();
          setOrganizerExists(true);
        } catch (cause) {
          const message = cleanErrorMessage(cause, "Could not claim owner access.");
          if (message.includes("owner already exists")) setAccessBlocked(true);
          else setError(message);
          return;
        } finally {
          setBusy(false);
        }
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!event.name.trim()) {
        setError("A conference name is required.");
        return;
      }
      setBusy(true);
      try {
        const id = await repo.events.save({
          ...event,
          name: event.name.trim(),
          slug: event.slug.trim() || slugify(event.name),
        });
        update({ id });
        setStep(2);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not save conference details.",
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    await complete();
  };
  const content = useMemo(() => {
    if (step === 0)
      return (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Welcome</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You're signed in as:
            </p>
          </div>
          <FormField label="Email">
            <Input value={email} disabled />
          </FormField>
        </div>
      );
    if (step === 1)
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Your conference</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You can add rooms, tracks, and more detail later in Settings →
              Event Details.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Conference name">
              <Input
                autoFocus
                value={event.name}
                onChange={(change) => {
                  const name = change.target.value;
                  update({
                    name,
                    ...(!slugTouched ? { slug: slugify(name) } : {}),
                  });
                }}
              />
            </FormField>
            <FormField label="URL slug">
              <Input
                value={event.slug}
                onChange={(change) => {
                  setSlugTouched(true);
                  update({ slug: slugify(change.target.value) });
                }}
              />
            </FormField>
            <FormField label="Event type">
              <Input
                value={event.type ?? ""}
                onChange={(change) => update({ type: change.target.value })}
              />
            </FormField>
            <FormField label="Timezone">
              <Input
                value={event.timezone}
                onChange={(change) => update({ timezone: change.target.value })}
              />
            </FormField>
            <FormField label="Starts at">
              <Input
                type="datetime-local"
                value={toDateTimeLocalValue(event.startDate)}
                onChange={(change) => {
                  const value = parseDateTimeLocalValue(change.target.value);
                  if (value !== undefined) update({ startDate: value });
                }}
              />
            </FormField>
            <FormField label="Ends at">
              <Input
                type="datetime-local"
                value={toDateTimeLocalValue(event.endDate)}
                onChange={(change) => {
                  const value = parseDateTimeLocalValue(change.target.value);
                  if (value !== undefined) update({ endDate: value });
                }}
              />
            </FormField>
          </div>
        </div>
      );
    if (step === 2)
      return event.id ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Connect email delivery</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect Resend or Amazon SES now so speakers receive delivery
              emails. You can also do this later in Settings.
            </p>
          </div>
          <EmailIntegrationForm eventId={event.id} />
        </div>
      ) : null;
    return event.id ? (
      <ImportDataStep eventId={event.id} onDone={() => void complete()} />
    ) : null;
  }, [email, event, slugTouched, step]);
  if (!loading && accessBlocked) {
    return (
      <PublicLayout width="wide">
        <main className="mx-auto max-w-xl rounded-lg bg-card p-6">
          <h1 className="text-xl font-semibold">Organizer access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This workspace already has an owner. Ask an event owner to add {email || "your account"} to the event team.
          </p>
          <div className="mt-5">
            <Button asChild variant="accent"><Link to="/portal">Return to speaker portal</Link></Button>
          </div>
        </main>
      </PublicLayout>
    );
  }
  return (
    <PublicLayout width="wide">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Set up your conference</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This takes about 2 minutes. You can skip any step and come back
            later.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <SkeletonList rows={4} label="Loading onboarding…" />
        ) : (
          <WizardShell
            steps={steps}
            activeStep={step}
            onStepChange={setStep}
            onBack={() => setStep((current) => Math.max(0, current - 1))}
            onNext={() => void next()}
            finalLabel={busy ? "Finishing…" : "Finish"}
            footerStart={
              step >= 2 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => (step === 2 ? setStep(3) : void complete())}
                  disabled={busy}
                >
                  Skip this step
                </Button>
              ) : undefined
            }
          >
            {content}
          </WizardShell>
        )}
      </div>
    </PublicLayout>
  );
}
