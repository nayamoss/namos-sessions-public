# Portal forms administration

**Route:** `/events/:eventSlug/portals/forms`  
**User:** Authorized event organizer.

## Journey

1. The organizer opens Portal forms and sees loading, empty, error, and populated states.
2. They create a disposable contact, group, or submission-task form, give it a valid internal and public name, and add fields.
3. They edit instructions, field labels/types/options/required state, confirmation settings, and field order; invalid fields stay editable with inline errors.
4. They preview or complete the form through its speaker-facing path and confirm only intended fields appear.
5. They duplicate the form, confirm a separate draft/version is made, then delete the disposable copy through confirmation.
6. They refresh and confirm the saved original and its fields persist within the active event only.

## Success and recovery

Failed saves retain the draft and no partial form is published. Deletion explains linked-task impact before confirmation.
