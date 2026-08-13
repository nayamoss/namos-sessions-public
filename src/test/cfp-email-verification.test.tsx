import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCfpEmailVerification } from "@/pages/public/CfpEmailVerification";

// The Account step used to accept a free-text email with no proof of ownership, which is why
// /portal (gated by RequireAuth) was unreachable for a genuinely anonymous submitter — see
// docs/features/portal-redirect-fixes/plan.md Phase 2b. These tests drive the state machine
// directly against mocked Clerk hooks, since the fake test Clerk key never finishes loading
// (see clerk-test-key.ts) and so can't exercise the real email-code round trip.

const signUpCreate = vi.fn();
const signUpPrepare = vi.fn();
const signUpAttempt = vi.fn();
const setActiveFromSignUp = vi.fn();
const signInCreate = vi.fn();
const signInPrepareFirstFactor = vi.fn();
const signInAttemptFirstFactor = vi.fn();
const setActiveFromSignIn = vi.fn();
const signOut = vi.fn();

vi.mock("@clerk/clerk-react", () => ({
  useSignUp: () => ({
    isLoaded: true,
    signUp: { create: signUpCreate, prepareEmailAddressVerification: signUpPrepare, attemptEmailAddressVerification: signUpAttempt },
    setActive: setActiveFromSignUp,
  }),
  useSignIn: () => ({
    isLoaded: true,
    signIn: { create: signInCreate, prepareFirstFactor: signInPrepareFirstFactor, attemptFirstFactor: signInAttemptFirstFactor },
    setActive: setActiveFromSignIn,
  }),
  useAuth: () => ({ isSignedIn: false, isLoaded: true }),
  useUser: () => ({ user: undefined }),
  useClerk: () => ({ signOut }),
}));

afterEach(() => vi.clearAllMocks());

describe("useCfpEmailVerification", () => {
  it("sends a code via sign-up for a new email, then verifies it", async () => {
    signUpCreate.mockResolvedValue(undefined);
    signUpPrepare.mockResolvedValue(undefined);
    signUpAttempt.mockResolvedValue({ status: "complete", createdSessionId: "sess_1" });

    const { result } = renderHook(() => useCfpEmailVerification("new-speaker@example.com"));
    expect(result.current.status).toBe("unverified");

    await act(async () => { await result.current.sendCode(); });
    expect(signUpCreate).toHaveBeenCalledWith({ emailAddress: "new-speaker@example.com" });
    expect(result.current.status).toBe("code-sent");

    act(() => result.current.setCode("123456"));
    await act(async () => { await result.current.verifyCode(); });
    expect(signUpAttempt).toHaveBeenCalledWith({ code: "123456" });
    expect(setActiveFromSignUp).toHaveBeenCalledWith({ session: "sess_1" });
    expect(result.current.status).toBe("verified");
  });

  it("falls back to sign-in when the email already has a Clerk identity", async () => {
    signUpCreate.mockRejectedValue({ errors: [{ code: "form_identifier_exists", message: "That email address is taken." }] });
    signInCreate.mockResolvedValue({ supportedFirstFactors: [{ strategy: "email_code", emailAddressId: "idn_1" }] });
    signInPrepareFirstFactor.mockResolvedValue(undefined);
    signInAttemptFirstFactor.mockResolvedValue({ status: "complete", createdSessionId: "sess_2" });

    const { result } = renderHook(() => useCfpEmailVerification("returning-speaker@example.com"));
    await act(async () => { await result.current.sendCode(); });
    expect(signInCreate).toHaveBeenCalledWith({ identifier: "returning-speaker@example.com" });
    expect(signInPrepareFirstFactor).toHaveBeenCalledWith({ strategy: "email_code", emailAddressId: "idn_1" });
    expect(result.current.status).toBe("code-sent");

    act(() => result.current.setCode("654321"));
    await act(async () => { await result.current.verifyCode(); });
    expect(setActiveFromSignIn).toHaveBeenCalledWith({ session: "sess_2" });
    expect(result.current.status).toBe("verified");
  });

  it("surfaces an invalid code without leaving the code-entry step", async () => {
    signUpCreate.mockResolvedValue(undefined);
    signUpPrepare.mockResolvedValue(undefined);
    signUpAttempt.mockRejectedValue({ errors: [{ message: "Incorrect code." }] });

    const { result } = renderHook(() => useCfpEmailVerification("someone@example.com"));
    await act(async () => { await result.current.sendCode(); });
    act(() => result.current.setCode("000000"));
    await act(async () => { await result.current.verifyCode(); });

    expect(result.current.status).toBe("code-sent");
    expect(result.current.error).toBe("Incorrect code.");
  });
});

describe("useCfpEmailVerification with an existing Clerk session", () => {
  it("treats a session whose email matches as already verified, with no code sent", async () => {
    vi.doMock("@clerk/clerk-react", () => ({
      useSignUp: () => ({ isLoaded: true, signUp: {}, setActive: setActiveFromSignUp }),
      useSignIn: () => ({ isLoaded: true, signIn: {}, setActive: setActiveFromSignIn }),
      useAuth: () => ({ isSignedIn: true, isLoaded: true }),
      useUser: () => ({ user: { primaryEmailAddress: { emailAddress: "already-signed-in@example.com" } } }),
      useClerk: () => ({ signOut }),
    }));
    vi.resetModules();
    const { useCfpEmailVerification: freshHook } = await import("@/pages/public/CfpEmailVerification");
    const { result } = renderHook(() => freshHook("already-signed-in@example.com"));
    await waitFor(() => expect(result.current.status).toBe("verified"));
    expect(signUpCreate).not.toHaveBeenCalled();
  });

  // Real browser finding (2026-08-12): the same Clerk dev instance's cookies are shared across
  // localhost ports, so a browser already signed in (e.g. an organizer testing their own CFP)
  // hits this on a genuinely different email — exactly the "wrong speaker" failure mode from
  // the original audit, just caught here instead of silently carrying into the portal.
  it("surfaces a conflicting session instead of a raw Clerk error, and can sign out to retry", async () => {
    vi.doMock("@clerk/clerk-react", () => ({
      useSignUp: () => ({ isLoaded: true, signUp: { create: signUpCreate, prepareEmailAddressVerification: signUpPrepare }, setActive: setActiveFromSignUp }),
      useSignIn: () => ({ isLoaded: true, signIn: {}, setActive: setActiveFromSignIn }),
      useAuth: () => ({ isSignedIn: true, isLoaded: true }),
      useUser: () => ({ user: { primaryEmailAddress: { emailAddress: "organizer@example.com" } } }),
      useClerk: () => ({ signOut }),
    }));
    vi.resetModules();
    signUpCreate.mockRejectedValueOnce({ errors: [{ code: "session_exists", message: "Session already exists" }] });
    signOut.mockResolvedValue(undefined);
    signUpCreate.mockResolvedValueOnce(undefined);
    signUpPrepare.mockResolvedValue(undefined);

    const { useCfpEmailVerification: freshHook } = await import("@/pages/public/CfpEmailVerification");
    const { result } = renderHook(() => freshHook("new-speaker@example.com"));

    await act(async () => { await result.current.sendCode(); });
    expect(result.current.status).toBe("session-conflict");
    expect(result.current.conflictingEmail).toBe("organizer@example.com");

    await act(async () => { await result.current.signOutAndRetry(); });
    expect(signOut).toHaveBeenCalled();
    expect(signUpCreate).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("code-sent");
  });
});
