import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useRepo } from "@/data/repo";
import type { PublicSubmissionFormConfig } from "@/data/types";
import { storePortalHandoffSpeaker } from "@/lib/portal-handoff";
import { publicSubmissionErrorMessage } from "@/lib/public-submission-error";
import { useCfpEmailVerification } from "@/pages/public/CfpEmailVerification";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { preloadTurnstile } from "@/lib/turnstile";
import { track } from "@/lib/analytics";
import { PublicFormRenderer, usePublicFormState } from "./PublicFormRenderer";

// Visual language deliberately mirrors /onboarding (OnboardingWizard.tsx): one focused question
// per screen, a thin top progress bar instead of a step-name tracker, a big heading, and pill
// buttons — see PublicFormRenderer.tsx for the shell/step rendering, shared with the builder's
// live preview so the two can never structurally drift from each other. This file keeps only
// what's unique to the real, public, network-backed submission: routing, data fetching, the
// actual submit mutation, Turnstile, Clerk email verification, and analytics.
export default function SubmissionPage() {
  const { eventSlug, formId } = useParams();
  const navigate = useNavigate();
  const repo = useRepo();
  const [config, setConfig] = useState<PublicSubmissionFormConfig | null>();
  const [errors, setErrors] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [seconds, setSeconds] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [idempotencyKey] = useState(() => globalThis.crypto?.randomUUID?.() ?? `submission-${Date.now()}`);
  const loading = config === undefined;
  const portalUrl = "/portal";
  const state = usePublicFormState(config ?? null);
  const { step, account, values, participants } = state;
  const emailVerification = useCfpEmailVerification(account.email);

  useEffect(() => {
    void preloadTurnstile().catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    if (!eventSlug || !formId) { setConfig(null); return () => { active = false; }; }
    setConfig(undefined);
    setErrors([]);
    repo.publicForms.get(eventSlug, formId).then((next) => {
      if (active) setConfig(next);
    }).catch((error) => {
      if (active) { setConfig(null); setErrors([error instanceof Error ? error.message : "This submission form could not be loaded."]); }
    });
    return () => { active = false; };
  }, [eventSlug, formId, repo]);

  useEffect(() => {
    if (!submitted || !config?.form.autoRedirectToPortal || seconds === 0) return;
    const timeout = window.setTimeout(() => setSeconds((value) => value - 1), 1_000);
    return () => window.clearTimeout(timeout);
  }, [config?.form.autoRedirectToPortal, seconds, submitted]);
  useEffect(() => { if (submitted && config?.form.autoRedirectToPortal && seconds === 0) navigate(portalUrl); }, [config?.form.autoRedirectToPortal, navigate, seconds, submitted]);

  useEffect(() => {
    // Fires on the Welcome→Account transition (the only way to reach step 1), matching the
    // original's "track on Continue past step 0" point rather than on page load/view.
    if (step === 1) track("public_submission_started", {});
  }, [step]);

  const abstractField = (() => {
    if (!config) return undefined;
    const submissionPage = config.form.pages.find((page) => page.kind === "custom");
    if (!submissionPage) return undefined;
    const byKey = new Map(config.form.fields.map((field) => [field.key, field]));
    const pageFields = submissionPage.fieldKeys.flatMap((key) => { const field = byKey.get(key); return field ? [field] : []; });
    const titleField = pageFields.find((field) => /title|session/i.test(field.label)) ?? pageFields[0];
    // The organizer controls field labels, so "Abstract" is not a stable machine identifier.
    // Tell the server which public field is the body by its opaque key; prefer rich text and
    // otherwise use the first non-title proposal field.
    return pageFields.find((field) => field.key !== titleField?.key && field.type === "wysiwyg") ?? pageFields.find((field) => field.key !== titleField?.key);
  })();
  const titleKey = (() => {
    if (!config) return undefined;
    const submissionPage = config.form.pages.find((page) => page.kind === "custom");
    const byKey = new Map(config.form.fields.map((field) => [field.key, field]));
    const pageFields = (submissionPage?.fieldKeys ?? []).flatMap((key) => { const field = byKey.get(key); return field ? [field] : []; });
    return (pageFields.find((field) => /title|session/i.test(field.label)) ?? pageFields[0])?.key;
  })();

  const onSubmit = async () => {
    if (!config || !eventSlug || !formId) return;
    setSubmitting(true);
    const title = titleKey ? values[titleKey] ?? "" : "";
    // Use the Clerk-verified email, not the free-text field: a submitter who edited the input
    // after verifying (the field is disabled once verified, but this is the safety net) must
    // never be able to claim an email they didn't actually verify.
    const verifiedEmail = emailVerification.verifiedEmail ?? account.email;
    try {
      const result = await repo.publicForms.submit({ eventSlug, formId, idempotencyKey, firstName: account.firstName.trim(), lastName: account.lastName.trim(), email: verifiedEmail, title, answers: values, ...(abstractField ? { abstractFieldKey: abstractField.key } : {}), participants, turnstileToken: turnstileToken! });
      // Hand the resolved speaker to /portal before the auto-redirect fires, so the
      // speaker lands on their own record instead of a "choose a speaker" dropdown.
      if (result.speakerId) storePortalHandoffSpeaker(result.speakerId);
      setSubmitted(true);
    } catch (error) {
      setErrors([publicSubmissionErrorMessage(error)]);
      setTurnstileToken(null);
      setTurnstileResetKey((value) => value + 1);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="px-6 py-6 sm:px-10"><span className="text-sm font-semibold">Namos Sessions</span></header>
        <main className="flex flex-1 items-center justify-center px-6 pb-16 sm:px-10">
          <div className="w-full max-w-2xl space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-11 w-full rounded-[12px]" />
          </div>
        </main>
      </div>
    );
  }
  if (!config) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="px-6 py-6 sm:px-10"><span className="text-sm font-semibold">Namos Sessions</span></header>
        <main className="flex flex-1 items-center justify-center px-6 pb-16 sm:px-10">
          <div className="w-full max-w-2xl space-y-4">
            <h1 className="text-2xl font-semibold sm:text-3xl">Submissions are closed</h1>
            <p className="text-sm text-muted-foreground">This call for proposals is not currently accepting submissions.</p>
          </div>
        </main>
      </div>
    );
  }

  const onReviewStep = step === config.form.pages.length && config.form.pages.at(-1)?.systemRole === "review";

  return (
    <div className="min-h-screen">
      <PublicFormRenderer
        config={config}
        mode="public"
        state={state}
        onSubmit={onSubmit}
        submitting={submitting}
        submitted={submitted}
        secondsToRedirect={seconds}
        emailVerification={emailVerification}
        errors={errors}
        turnstileSlot={onReviewStep ? <TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileResetKey} /> : undefined}
        submissionVerificationComplete={Boolean(turnstileToken)}
      />
    </div>
  );
}
