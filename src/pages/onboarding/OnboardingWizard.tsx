import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { useUser } from "@clerk/clerk-react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Camera, ChevronDown, Eye, EyeOff, Loader2, Smartphone } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TimezoneCombobox } from "@/components/shared/TimezoneCombobox";
import { DateTimeField } from "@/components/shared/DateTimeField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useRepo } from "@/data/repo";
import type { Event } from "@/data/types";
import { friendlyErrorMessage } from "@/lib/errors";
import { getBrowserTimezone } from "@/lib/timezones";
import { ImportDataStep } from "./steps/ImportDataStep";

const stepMeta = [
  { id: "welcome", label: "Welcome" },
  { id: "identity", label: "A couple quick things" },
  { id: "conference", label: "Your conference" },
  { id: "mobile", label: "On the go" },
  { id: "import", label: "Import data" },
] as const;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "my-conference";

// Keep enough of the local part visible to recognize the signed-in account without putting
// the full identifier on display during a shared-screen onboarding flow. Long addresses mask
// five characters; shorter ones mask at least three when possible.
export const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const hiddenLength = Math.min(local.length, Math.max(3, Math.min(5, Math.floor(local.length / 2))));
  return `${"•".repeat(hiddenLength)}${local.slice(hiddenLength)}@${domain}`;
};

const blankEvent = (): Omit<Event, "id"> => ({
  name: "",
  slug: "",
  type: "Conference",
  timezone: getBrowserTimezone() || "UTC",
  startDate: (() => { const date = new Date(); date.setDate(date.getDate() + 14); date.setHours(9, 0, 0, 0); return date.getTime(); })(),
  endDate: (() => { const date = new Date(); date.setDate(date.getDate() + 15); date.setHours(9, 0, 0, 0); return date.getTime(); })(),
  exhibitorsEnabled: false,
  sponsorsEnabled: false,
  status: "draft",
});

function Wordmark() {
  // Reuses the exact "Namos Sessions" wordmark treatment already shown on the sign-in screen
  // (AuthSplitLayout / PublicLayout's brandHref) — same accent dot color as the rest of the app.
  return (
    <Link to="/" className="inline-flex items-center gap-2 text-foreground no-underline">
      <span className="text-sm font-semibold">Namos Sessions</span>
      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
    </Link>
  );
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  const percent = ((step + 1) / total) * 100;
  return (
    <div className="fixed inset-x-0 top-0 z-10 h-1 bg-background">
      <div
        className="h-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${percent}%` }}
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Step ${step + 1} of ${total}`}
      />
    </div>
  );
}

function PrimaryButton({ children, onClick, busy, disabled, type = "button", autoFocus }: {
  children: ReactNode;
  onClick?: () => void;
  busy?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  autoFocus?: boolean;
}) {
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      autoFocus={autoFocus}
      data-autofocus={autoFocus ? "true" : undefined}
      className="h-11 gap-2 rounded-[12px] px-6"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
      {!busy && <ArrowRight className="h-4 w-4" />}
    </Button>
  );
}

// Friendly, on-brand replacement for dumping a raw error (JSON payloads, Convex stack envelopes,
// auth-provider rejections) straight into the page. The real cause is always logged to the
// console via `friendlyErrorMessage` for debugging — this is only what the organizer sees.
function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <p>{message}</p>
      {onRetry && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onRetry}>Retry setup</Button>}
    </div>
  );
}

function StepErrorFallback({ onSkip }: { onSkip?: () => void }) {
  return (
    <div className="space-y-4 rounded-[12px] bg-card p-6">
      <div>
        <h2 className="text-lg font-semibold">This step hit a snag</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Something went wrong loading this step. You can try reloading, or skip it and finish setup
          — nothing you've already saved will be lost.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          Reload
        </Button>
        {onSkip && (
          <Button type="button" variant="ghost" onClick={onSkip}>
            Skip this step
          </Button>
        )}
      </div>
    </div>
  );
}

export default function OnboardingWizard() {
  const repo = useRepo();
  const navigate = useNavigate();
  const { user } = useUser();
  const [step, setStep] = useState(0);
  const [event, setEvent] = useState<Omit<Event, "id"> & { id?: Event["id"] }>(blankEvent);
  const [identity, setIdentity] = useState<{ signupRole?: "solo" | "team"; referralSource?: string }>({});
  const [referralChoice, setReferralChoice] = useState("");
  const [otherReferralSelected, setOtherReferralSelected] = useState(false);
  const [otherReferralSource, setOtherReferralSource] = useState("");
  const [customizeDetails, setCustomizeDetails] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [slugTouched, setSlugTouched] = useState(false);
  const [organizerExists, setOrganizerExists] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [isEmailVisible, setIsEmailVisible] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>();
  const avatarPreviewRef = useRef<string>();
  avatarPreviewRef.current = avatarPreview;
  const stepRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const firstName = user?.firstName?.trim();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? "";

  useEffect(() => {
    if (!nameTouched && user?.firstName) setDisplayName(user.firstName);
    // Clerk always returns an imageUrl — a generated placeholder when no photo was ever set.
    // `hasImage` is the actual signal for whether the user chose one.
    if (!avatarPreview && user?.hasImage) setAvatarPreview(user.imageUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.firstName, user?.imageUrl, user?.hasImage]);

  const chooseAvatar = (change: ChangeEvent<HTMLInputElement>) => {
    const file = change.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview((current) => {
      // Revoke the previous blob URL (picking a photo more than once shouldn't leak one per
      // pick) — only ever a blob: URL here, never Clerk's own https:// placeholder/photo URL.
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  };

  useEffect(() => {
    return () => {
      if (avatarPreviewRef.current?.startsWith("blob:")) URL.revokeObjectURL(avatarPreviewRef.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [organizer, events] = await Promise.all([
        repo.organizers.getMine(),
        repo.events.listMine().catch(() => []),
      ]);
      setOrganizerExists(Boolean(organizer));
      const firstEvent = events.at(0);
      if (firstEvent) {
        setEvent(firstEvent);
        setSlugTouched(true);
      }
    } catch (cause) {
      setError(friendlyErrorMessage(cause, "Could not load onboarding. Try refreshing the page."));
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    const debugStep = new URLSearchParams(window.location.search).get("__debugStep");
    if (debugStep) {
      setLoading(false);
      setStep(Number(debugStep));
      setEvent((current) => ({ ...current, id: "debug-event" as Event["id"], name: "Namos Demo Conference" }));
      return;
    }
    void load();
  }, [load]);

  // Auto-focus the first field of every screen, and let the whole flow work keyboard-only.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      stepRef.current?.querySelector<HTMLElement>('[data-autofocus="true"]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);

  const update = (patch: Partial<typeof event>) => setEvent((current) => ({ ...current, ...patch }));

  const complete = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (organizerExists) await repo.organizers.completeOnboarding();
      navigate("/", { replace: true });
    } catch (cause) {
      setError(friendlyErrorMessage(cause, "Could not finish onboarding. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => setStep((current) => Math.max(0, current - 1));

  const next = async () => {
    setError(undefined);
    if (step === 0) {
      if (!organizerExists) {
        setBusy(true);
        try {
          // Every signup gets their OWN organization — never joins an existing one. The
          // mutation is idempotent per user, so a resumed or replayed onboarding reuses the
          // organization already created rather than minting a second.
          await repo.organizations.createForCurrentUser({
            name: displayName.trim() ? `${displayName.trim()}'s organization` : undefined,
          });
          setOrganizerExists(true);
        } catch (cause) {
          setError(friendlyErrorMessage(cause, "Could not set up your organization."));
          return;
        } finally {
          setBusy(false);
        }
      }
      const trimmedName = displayName.trim();
      const nameChanged = trimmedName && trimmedName !== (user?.firstName ?? "");
      if (nameChanged || avatarFile) {
        setBusy(true);
        try {
          // Name lives on our own userProfiles row, not Clerk's user record — this Clerk
          // instance has first/last name collection disabled and rejects `user.update({
          // firstName })` outright ("first_name is not a valid parameter for this request").
          if (nameChanged) {
            void repo.profiles.save({ displayName: trimmedName }).catch((cause) => {
              console.error(friendlyErrorMessage(cause, "Could not save your name."));
            });
          }
          if (avatarFile && user) await user.setProfileImage({ file: avatarFile });
        } catch (cause) {
          // Best-effort, same as the identity step — never blocks getting into the product.
          console.error(friendlyErrorMessage(cause, "Could not save your photo."));
        } finally {
          setBusy(false);
        }
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      void repo.profiles.save(identity).catch((cause) => {
        console.error(friendlyErrorMessage(cause, "Could not save onboarding profile."));
      });
      setStep(2);
      return;
    }
    if (step === 2) {
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
        setStep(3);
      } catch (cause) {
        setError(friendlyErrorMessage(cause, "Could not save conference details."));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 3) {
      setStep(4);
      return;
    }
    await complete();
  };

  // Full keyboard-only navigation: Enter advances (or submits the current screen), Shift+Enter
  // or Backspace-on-an-already-empty text field goes back. Anything happening inside a popover
  // (the timezone combobox, the date picker) is left alone so it can handle its own keys —
  // React portals still bubble synthetic events up to this handler, so that has to be explicit.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-onboarding-popover]")) return;
    if (target.tagName === "BUTTON") return; // native activation already handles Enter/Space
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) goBack();
      else void next();
      return;
    }
    if (event.key === "Backspace" && target instanceof HTMLInputElement && target.type === "text" && target.value === "") {
      event.preventDefault();
      goBack();
    }
  };

  const total = stepMeta.length;
  const canSkip = step >= 1;

  return (
    <div
      className="relative flex min-h-screen flex-col bg-background text-foreground"
      onKeyDown={handleKeyDown}
    >
      <ProgressBar step={step} total={total} />
      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <Wordmark />
        <div className="flex items-center gap-4">
          {/* Organizer setup is reached by anyone signed in without an organizer record —
              which is also what a speaker looks like, since a speaker is matched by email
              on a per-event basis and has no cross-event signal to route on. Without an
              exit, a speaker who lands here is stuck being asked to create a conference.
              This is the escape hatch; proper routing needs a speakers-by-email lookup. */}
          <Link
            to="/portal"
            className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            I&apos;m a speaker
          </Link>
          <span className="text-xs font-medium text-muted-foreground">
            {step + 1} / {total}
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-28 sm:px-10">
        {loading ? (
          <div className="w-full max-w-lg space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-11 w-full rounded-[12px]" />
          </div>
        ) : (
          <div ref={stepRef} key={step} className="w-full max-w-lg animate-fade-in">
            {step === 0 && (
              <section className="space-y-6 text-center sm:text-left">
                <div>
                  <h1 className="text-3xl font-semibold sm:text-4xl">What should we call you?</h1>
                  <p className="mt-3 text-base text-muted-foreground">
                    We'll use this everywhere we address you. Takes 30 seconds — both fields are
                    optional, and you can change them later in Settings.
                  </p>
                </div>
                <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:text-left">
                  <div className="flex flex-col items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => avatarInputRef.current?.click()}
                      className="group relative h-24 w-24 rounded-full p-0 hover:bg-transparent"
                      aria-label={avatarPreview ? "Change your photo" : "Add a photo"}
                    >
                      <Avatar className="h-24 w-24">
                        {avatarPreview && <AvatarImage src={avatarPreview} alt="" />}
                        <AvatarFallback className="text-2xl font-medium">
                          {(displayName || firstName || email)[0]?.toUpperCase() ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-transparent transition-colors group-hover:bg-black/40 group-hover:text-white">
                        <Camera className="h-5 w-5" />
                      </span>
                    </Button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={chooseAvatar}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => avatarInputRef.current?.click()}
                      className="h-auto p-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                    >
                      {avatarPreview ? "Change photo" : "Add a photo"}
                    </Button>
                  </div>
                  <div className="w-full space-y-2 text-left">
                    <Label htmlFor="onboarding-name">Your name</Label>
                    <Input
                      id="onboarding-name"
                      data-autofocus="true"
                      className="h-11 rounded-[12px] bg-card text-base"
                      placeholder="e.g. Jordan"
                      value={displayName}
                      onChange={(change) => { setNameTouched(true); setDisplayName(change.target.value); }}
                    />
                    {email && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <p>Signed in as {isEmailVisible ? email : maskEmail(email)}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setIsEmailVisible((visible) => !visible)}
                          className="h-6 w-6 rounded p-1 text-muted-foreground hover:text-foreground"
                          aria-label={isEmailVisible ? "Hide signed-in email address" : "Show signed-in email address"}
                          title={isEmailVisible ? "Hide email" : "Show email"}
                        >
                          {isEmailVisible ? <EyeOff aria-hidden="true" className="h-3.5 w-3.5" /> : <Eye aria-hidden="true" className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                {error && <InlineError message={error} onRetry={() => void load()} />}
                <div className="flex justify-center sm:justify-start">
                  <PrimaryButton onClick={() => void next()} busy={busy}>
                    Continue
                  </PrimaryButton>
                </div>
              </section>
            )}

            {step === 1 && (
              <section className="space-y-6">
                <div>
                  <h1 className="text-2xl font-semibold sm:text-3xl">A couple quick things</h1>
                  <p className="mt-2 text-sm text-muted-foreground">Helps us set things up right for you — skip if you'd rather not say.</p>
                </div>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label>Are you running this solo or with a team?</Label>
                    <div className="flex gap-2">
                      {(["solo", "team"] as const).map((role) => (
                        <Button
                          key={role}
                          type="button"
                          variant={identity.signupRole === role ? "default" : "secondary"}
                          className="h-11 flex-1 rounded-[10px]"
                          aria-pressed={identity.signupRole === role}
                          onClick={() => setIdentity((current) => ({ ...current, signupRole: role }))}
                        >
                          {role === "solo" ? "Solo" : "With a team"}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="referral-source">How did you hear about us?</Label>
                    <Select
                      value={referralChoice}
                      onValueChange={(value) => {
                        setReferralChoice(value);
                        setOtherReferralSelected(value === "Other");
                        if (value !== "Other") setOtherReferralSource("");
                        setIdentity((current) => ({ ...current, referralSource: value }));
                      }}
                    >
                      <SelectTrigger id="referral-source" className="h-11 rounded-[12px] bg-card"><SelectValue placeholder="Choose one" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Search">Search</SelectItem>
                        <SelectItem value="Social media">Social media</SelectItem>
                        <SelectItem value="A colleague or friend">A colleague or friend</SelectItem>
                        <SelectItem value="Another conference tool">Another conference tool</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {otherReferralSelected && (
                      <Input
                        data-autofocus="true"
                        className="mt-2 h-11 rounded-[12px] bg-card"
                        placeholder="Tell us more"
                        value={otherReferralSource}
                        onChange={(change) => { setOtherReferralSource(change.target.value); setIdentity((current) => ({ ...current, referralSource: change.target.value || "Other" })); }}
                      />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" className="h-11 rounded-[12px]" onClick={goBack}>Back</Button>
                  <PrimaryButton onClick={() => void next()}>Continue</PrimaryButton>
                  <Button type="button" variant="ghost" onClick={() => setStep(2)}>Skip this step</Button>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="space-y-6">
                <div>
                  <h1 className="text-2xl font-semibold sm:text-3xl">Name your conference</h1>
                  <p className="mt-2 text-sm text-muted-foreground">We've filled in sensible defaults below — change anything now, or later in Settings → Event Details.</p>
                </div>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="conference-name">Conference name</Label>
                    <Input id="conference-name" data-autofocus="true" className="h-11 rounded-[12px] bg-card text-base" placeholder="e.g. Namos Sessions Summit" value={event.name} onChange={(change) => { const name = change.target.value; update({ name, ...(!slugTouched ? { slug: slugify(name) } : {}) }); }} />
                  </div>
                  <Collapsible open={customizeDetails} onOpenChange={setCustomizeDetails}>
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="ghost" className="h-10 gap-2 px-0 text-sm font-medium">
                        Customize details <ChevronDown className={`h-4 w-4 transition-transform ${customizeDetails ? "rotate-180" : ""}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-5 pt-4">
                      <div className="grid gap-5 sm:grid-cols-2">
                        <div className="space-y-2"><Label htmlFor="conference-slug">URL slug</Label><Input id="conference-slug" className="h-11 rounded-[12px] bg-card" value={event.slug} onChange={(change) => { setSlugTouched(true); update({ slug: slugify(change.target.value) }); }} /></div>
                        <div className="space-y-2"><Label htmlFor="conference-type">Event type</Label><Input id="conference-type" className="h-11 rounded-[12px] bg-card" value={event.type ?? ""} onChange={(change) => update({ type: change.target.value })} /></div>
                      </div>
                      <div className="space-y-2"><Label htmlFor="conference-timezone">Timezone</Label><TimezoneCombobox id="conference-timezone" value={event.timezone} onChange={(timezone) => update({ timezone })} /></div>
                      <div className="space-y-5">
                        <div className="space-y-2"><Label>Starts at</Label><DateTimeField valueMs={event.startDate} onChange={(startDate) => update({ startDate })} /></div>
                        <div className="space-y-2"><Label>Ends at</Label><DateTimeField valueMs={event.endDate} onChange={(endDate) => update({ endDate })} /></div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
                {error && <InlineError message={error} />}
                <div className="flex items-center gap-3"><Button type="button" variant="outline" className="h-11 rounded-[12px]" onClick={goBack}>Back</Button><PrimaryButton onClick={() => void next()} busy={busy}>Continue</PrimaryButton></div>
              </section>
            )}

            {step === 3 && (
              <section className="space-y-6">
                <div>
                  <h1 className="text-2xl font-semibold sm:text-3xl">Take it with you</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Namos Sessions is built to work on your phone — no app required. Open
                    it in your mobile browser and everything you just set up is there:
                    the schedule, speakers, and reviews.
                  </p>
                </div>
                <div className="space-y-4 rounded-[12px] bg-card p-6">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
                      <Smartphone aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">Works on any phone today</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Sign in at the same address on your phone or tablet — the whole
                        dashboard is designed for small screens, so you can run a session
                        from the hallway.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
                      <span aria-hidden="true" className="text-xs font-semibold">Soon</span>
                    </span>
                    <div>
                      <p className="text-sm font-medium">iOS and Android apps are coming</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Native apps are on the way. Nothing to do now — we'll let you know
                        the moment they're ready.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" className="h-11 rounded-[12px]" onClick={goBack}>Back</Button>
                  <PrimaryButton onClick={() => void next()} autoFocus>Got it</PrimaryButton>
                </div>
              </section>
            )}

            {step === 4 && (
              <section className="space-y-6">
                <ErrorBoundary fallback={<StepErrorFallback />}>
                  {event.id ? (
                    <ImportDataStep eventId={event.id} onDone={() => void complete()} />
                  ) : (
                    <div>
                      <h1 className="text-2xl font-semibold sm:text-3xl">Import previous conference data</h1>
                      <p className="mt-2 text-sm text-muted-foreground">
                        We need your conference saved first before you can import speakers.
                      </p>
                      <Button type="button" variant="outline" className="mt-4" onClick={() => setStep(2)}>
                        Go back to conference details
                      </Button>
                    </div>
                  )}
                </ErrorBoundary>
                {error && <InlineError message={error} />}
                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" className="h-11 rounded-[12px]" onClick={goBack} disabled={busy}>
                    Back
                  </Button>
                  <PrimaryButton onClick={() => void next()} busy={busy}>
                    {busy ? "Finishing…" : "Finish setup"}
                  </PrimaryButton>
                  <Button type="button" variant="ghost" onClick={() => void complete()} disabled={busy}>
                    Skip and finish
                  </Button>
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 flex items-center justify-center gap-4 px-6 py-4 text-xs text-muted-foreground sm:justify-end sm:px-10">
        <span className="hidden sm:inline">
          Press <kbd className="rounded bg-card px-1.5 py-0.5 font-mono">Enter ↵</kbd> to continue
          {canSkip ? "" : ", Shift+Enter to go back"}
        </span>
      </footer>
    </div>
  );
}
