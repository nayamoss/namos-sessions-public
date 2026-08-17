# Organizer onboarding

**Route:** `/onboarding`  
**User:** Authenticated organizer without completed onboarding.

## Starting state

The user has a valid identity but no completed organization/event setup. A disposable CSV is
available for the optional import path.

## Journey

1. The organizer reaches onboarding after sign-up or a protected-route redirect.
2. They complete the organization and initial event fields; required fields and invalid dates show
   inline validation.
3. They choose the CSV import step, upload a valid disposable file, map or review values, and fix
   any row-level errors.
4. They move backward and forward between steps and confirm entered data remains intact.
5. They submit once, see a completion state, and land on Events or the created event dashboard.
6. They refresh and confirm setup is persisted; reopening `/onboarding` does not create a second
   organization or event.

## Success and recovery

No partial organization/event is created for invalid input or a rejected import. Failed submission
preserves entered data and offers retry. Imported disposable records are removed through their owning
pages or recorded for cleanup.
