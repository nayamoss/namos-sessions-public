# Sign up

**Route:** `/sign-up`  
**User:** A new organizer or speaker account holder.

## Starting state

The user is signed out and does not have an account for the submitted email.

## Journey

1. The user opens Sign up from Sign in or a public CFP handoff.
2. They enter invalid or incomplete details and see provider validation without losing safe fields.
3. They enter valid details, complete required verification, and submit once.
4. The new session is established and returns to the appropriate safe destination.
5. A new organizer enters onboarding; a verified speaker resolves only to their own portal profile.
6. The user refreshes, signs out, signs back in, and confirms the account is not duplicated.

## Success and recovery

Success is a verified session and the correct first-run screen. Duplicate email, verification expiry,
and provider failure states explain how to retry. Account deletion is intentionally N/A in product UI.
