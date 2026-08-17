# Submission form builder

**Route:** `/events/:eventSlug/program/forms/:id/edit`  
**User:** Authorized event organizer.

## Starting state

The organizer has opened an existing or newly created form from Submission forms; tags, tracks,
reviewers, and a disposable public form fixture are available.

## Journey

1. The builder loads the form and preserves the event scope in the URL; a missing/forbidden form
   shows a safe unavailable state.
2. The organizer edits setup and welcome copy, then adds, edits, reorders, and removes abstract and
   participant fields using the visible builder controls.
3. They add required, conditional, option-based, and validation rules; invalid labels/options/rules
   explain the correction inline.
4. They configure routing, settings, and notifications, including a disposable tag/track/reviewer
   target, then save.
5. They reload and confirm field order, conditions, limits, routing, and settings rehydrate.
6. They preview/open the public CFP, exercise conditional fields and required validation, and verify
   organizer-only routing details are not exposed.
7. They make a change, attempt to leave, and choose both stay and discard paths in the unsaved-change
   confirmation.

## Success and recovery

Save failure keeps the draft editable, does not claim success, and permits retry. Deleting a field or
rule uses an explicit destructive control and cannot silently erase unrelated saved configuration.
