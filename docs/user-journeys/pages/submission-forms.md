# Submission forms

**Route:** `/events/:eventSlug/program/forms`  
**User:** Authorized event organizer.

## Starting state

The event has open and closed forms, plus no-form data for the empty-state check.

## Journey

1. The organizer opens Program → Submission forms and sees loading, empty, error, open, and closed
   states; tabs and search/filter controls are below the title row.
2. They create a form from the visible entry point and choose a template or blank form.
3. Back in the list, they search, filter, and open the created form's builder.
4. They duplicate an existing form, give it a distinct title/public identity, and confirm the copy
   is separate from the source.
5. They open the public link for an open form and verify it exposes only public fields.
6. They delete a disposable form, cancel once, then confirm; the list updates and refresh does not
   restore it.

## Success and recovery

Create, duplicate, and delete failures show a specific error without losing the current list or
creating duplicates. Public links for closed/deleted forms show a safe unavailable state.
