import { useEffect, useState } from "react";
import { useAuth, useClerk, useSignIn, useSignUp, useUser } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

// The CFP's Account step used to accept a free-text email with no proof of ownership. That is
// how a signed-out submitter could never reach their own /portal afterward: `/portal/*` is (and
// must stay) gated by RequireAuth, and nothing here had established a Clerk session. Verifying
// the email via Clerk's email-code strategy — instead of a custom scoped access token — means
// RequireAuth and the existing email-matched speakers.getMine lookup work completely unmodified.
//
// This intentionally does not touch RequireAuth or add any Convex function. See
// docs/features/portal-redirect-fixes/plan.md Phase 2b for the full rationale.

type Status = "unverified" | "sending" | "code-sent" | "verifying" | "verified" | "error" | "session-conflict";

/** Statuses in which the submitter may still change the address they are verifying.
 *  session-conflict belongs here: the whole reason for the conflict may be that they
 *  want to submit under a different email than the one this browser is signed in as. */
export function emailEditable(status: Status) {
  return status === "unverified" || status === "error" || status === "session-conflict";
}

export function useCfpEmailVerification(email: string) {
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveFromSignUp } = useSignUp();
  const { isLoaded: signInLoaded, signIn, setActive: setActiveFromSignIn } = useSignIn();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const [status, setStatus] = useState<Status>("unverified");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [usingSignIn, setUsingSignIn] = useState(false);

  // A speaker who verified earlier in this browser session (e.g. re-submitting, or came back
  // from /portal) already has a live Clerk session — never make them re-verify the same email.
  useEffect(() => {
    if (!authLoaded) return;
    const sessionEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
    if (isSignedIn && sessionEmail && sessionEmail === email.trim().toLowerCase()) setStatus("verified");
  }, [authLoaded, isSignedIn, user, email]);

  const verifiedEmail = isSignedIn ? user?.primaryEmailAddress?.emailAddress : undefined;

  const sendCode = async () => {
    if (!signUpLoaded || !signInLoaded || status === "sending" || status === "verified") return;
    setError(undefined);
    setStatus("sending");
    const trimmed = email.trim();
    try {
      await signUp.create({ emailAddress: trimmed });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setUsingSignIn(false);
      setStatus("code-sent");
    } catch (cause) {
      // The browser already carries a different Clerk session (e.g. an organizer testing
      // their own CFP, or a stale session from earlier in the browser). Clerk correctly
      // refuses to start a sign-up while one exists — this is exactly the "wrong speaker"
      // condition from the original audit, just caught one step earlier, before it could
      // silently carry into the portal. Surface it instead of raw Clerk error text.
      if (isClerkError(cause, "session_exists")) { setStatus("session-conflict"); return; }
      // A returning speaker's email already has a Clerk identity — fall through to sign-in.
      const isExistingIdentifier = isClerkError(cause, "form_identifier_exists");
      if (!isExistingIdentifier) { setError(clerkErrorMessage(cause, "Could not send a verification code.")); setStatus("error"); return; }
      try {
        const attempt = await signIn.create({ identifier: trimmed });
        const factor = attempt.supportedFirstFactors?.find((candidate) => candidate.strategy === "email_code");
        if (!factor || !("emailAddressId" in factor)) throw new Error("This email can't be verified by code.");
        await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
        setUsingSignIn(true);
        setStatus("code-sent");
      } catch (signInCause) {
        setError(clerkErrorMessage(signInCause, "Could not send a verification code."));
        setStatus("error");
      }
    }
  };

  const verifyCode = async () => {
    if (status === "verifying" || code.trim().length < 6) return;
    setError(undefined);
    setStatus("verifying");
    try {
      if (usingSignIn) {
        const result = await signIn.attemptFirstFactor({ strategy: "email_code", code: code.trim() });
        if (result.status !== "complete" || !result.createdSessionId) throw new Error("That code didn't verify. Check it and try again.");
        await setActiveFromSignIn({ session: result.createdSessionId });
      } else {
        const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
        if (result.status !== "complete" || !result.createdSessionId) throw new Error("That code didn't verify. Check it and try again.");
        await setActiveFromSignUp({ session: result.createdSessionId });
      }
      setStatus("verified");
    } catch (cause) {
      setError(clerkErrorMessage(cause, "That code didn't verify. Check it and try again."));
      setStatus("code-sent");
    }
  };

  const reset = () => { setStatus("unverified"); setCode(""); setError(undefined); };

  const signOutAndEdit = async () => {
    await clerk.signOut({ redirectUrl: window.location.pathname + window.location.search });
    reset();
  };

  const signOutAndRetry = async () => {
    // Clerk's signOut() redirects to "/" by default, which would bounce the submitter off the
    // CFP entirely (and straight into RequireAuth's sign-in redirect, since "/" is dashboard).
    // Keep them exactly where they are.
    await clerk.signOut({ redirectUrl: window.location.pathname + window.location.search });
    reset();
    await sendCode();
  };

  return { status, code, setCode, error, sendCode, verifyCode, reset, signOutAndRetry, signOutAndEdit, verifiedEmail, conflictingEmail: user?.primaryEmailAddress?.emailAddress, ready: signUpLoaded && signInLoaded && authLoaded };
}

function isClerkError(cause: unknown, code: string): boolean {
  const errors = (cause as { errors?: Array<{ code?: string }> } | undefined)?.errors;
  return Array.isArray(errors) && errors.some((entry) => entry.code === code);
}

function clerkErrorMessage(cause: unknown, fallback: string): string {
  const errors = (cause as { errors?: Array<{ message?: string }> } | undefined)?.errors;
  return errors?.[0]?.message ?? fallback;
}

export function CfpEmailVerificationPanel({ verification, emailValid }: { verification: ReturnType<typeof useCfpEmailVerification>; emailValid: boolean }) {
  const { status, code, setCode, error, sendCode, verifyCode, reset, signOutAndRetry, signOutAndEdit, conflictingEmail, ready } = verification;

  if (status === "verified") return <p role="status" className="text-sm">Email verified.</p>;

  if (status === "session-conflict") {
    return (
      <div className="space-y-3 rounded-md bg-muted p-4">
        <p className="text-sm">This browser is already signed in{conflictingEmail ? ` as ${conflictingEmail}` : ""}. Sign out to keep going.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="accent" size="sm" onClick={() => void signOutAndRetry()}>Sign out and send code</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void signOutAndEdit()}>Sign out and change email</Button>
        </div>
      </div>
    );
  }

  if (status === "code-sent" || status === "verifying") {
    return (
      <div className="space-y-3 rounded-md bg-muted p-4">
        <p className="text-sm">Enter the 6-digit code we just emailed you.</p>
        <InputOTP maxLength={6} value={code} onChange={setCode} disabled={status === "verifying"}>
          <InputOTPGroup>
            {Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} className="border-none bg-background" />)}
          </InputOTPGroup>
        </InputOTP>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="accent" size="sm" disabled={status === "verifying" || code.trim().length < 6} onClick={() => void verifyCode()}>{status === "verifying" ? "Verifying…" : "Verify"}</Button>
          <Button type="button" variant="ghost" size="sm" disabled={status === "verifying"} onClick={reset}>Use a different email</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" disabled={!ready || !emailValid || status === "sending"} onClick={() => void sendCode()}>{status === "sending" ? "Sending…" : "Send verification code"}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
