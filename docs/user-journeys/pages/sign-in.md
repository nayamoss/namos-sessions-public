# Sign in

**Route:** `/sign-in`  
**User:** Returning organizer, reviewer, or speaker.

## Starting state

The user is signed out and has a valid account. A protected destination may be stored as the safe
return path.

## Journey

1. The user opens the sign-in page from a protected route or the account menu.
2. They see the sign-in form, sign-up link, and provider choices without organizer data.
3. They submit an invalid email or password and receive the identity-provider error in context.
4. They correct the credentials and submit once.
5. The app restores the safe requested destination. Organizers without completed onboarding go to
   onboarding; speakers go to their portal; an organizer with events reaches Events or the selected
   event dashboard.
6. The user refreshes and remains signed in, then signs out and confirms protected routes return to
   sign-in.

## Success and recovery

Success is the correct authenticated destination with no other user's event data visible. Expired,
blocked, or provider-failed sessions explain the next action and keep the user on a recoverable
identity screen. CRUD is intentionally N/A; the identity provider owns credentials.
