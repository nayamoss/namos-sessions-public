# Organization settings

**Route:** `/settings/organization`  
**User:** Organization owner or admin; owner-only mutations are checked separately.

## Starting state

The organization has an owner, an admin, and a disposable invite email.

## Journey

1. The owner navigates from the organization menu and sees the organization team with loading,
   empty, populated, and error states.
2. They open Invite, enter an invalid email, correct it, choose an allowed role, and submit.
3. The invited person appears with the correct pending/active state and organization role.
4. The owner attempts the same email again and sees a recoverable duplicate error.
5. The owner chooses Remove, cancels the confirmation once, then confirms removal and sees the row
   disappear.
6. An admin confirms the allowed read-only or restricted view; a non-owner cannot invoke owner-only
   changes.
7. Refresh confirms invite/removal persistence and a removed user loses organization-wide access.

## Success and recovery

Failed invitations/removals leave the displayed team unchanged and preserve safe form input. No team
mutation may change event membership outside its declared scope.
