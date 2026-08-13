# Portal Forms

**Phase 11 · ~3-4h** · Screenshots: *Portal > Forms* (brief p.24-26)

Routes: `/portals/forms` (admin), `/portal/forms/:id` (speaker)

## Goal

Forms speakers fill out **after acceptance**, attached to tasks — A/V requirements, travel
details, headshot confirmation. Distinct from the CFP form.

The brief's own note: *"For speakers to fill out a form in a Task."*

## Relationship to the CFP builder

Same renderer, same field library, **lighter builder**. The CFP wizard is 7 steps; this one is
3. Don't build a second form engine — parameterize the first.

| | CFP builder | Portal forms |
|---|---|---|
| Steps | 7 | 3 |
| Types | Abstracts / Sessions | Contacts / Groups / Submissions |
| Public? | Yes, unauthenticated | No, portal-authed |
| Participants step | Yes | No |

## Screens

**Admin list** — "Create forms that can be assigned to your portals to collect information."
Tabs: All Forms · Contact Forms · Group Forms · Submission Forms (with counts). `+ Add`.
Empty state: *"No forms yet — Create a form to collect information from participants."*

**Create/Edit wizard** — 3 steps:
1. **Form Setup** — Name\*, Title\*, and a **Type** choice of three cards: *Contacts* ("collect
   contact information from people"), *Groups* ("collect information from sponsors and
   exhibitors"), *Submissions* ("collect submission related information").
2. **Form Questions** — Section Title\*, Description & Instructions (rich text), then Form
   Questions with `+ Add Field`. The Add Field popover offers **Add Section Element**,
   **Create Field**, and a **searchable list of existing fields** — Client Session ID (text),
   Description (wysiwyg), Format / Language / Level / Tags (dropdown). Rows have a lock icon
   and a Required toggle.
3. **Settings** — **Send Confirmation Email** toggle + rich-text body ("Thank you for
   submitting your form. Here is a link to your submission.").

Header actions on edit: Duplicate · **Delete** (destructive) · Save. Toast on save:
*"Saved successfully — Your changes have been saved."*

## The field library is the real insight

That Add Field popover is a **shared, searchable field library** across both builders — see
`field_definitions` in [submission-form-builder](../submission-form-builder/plan.md). Model it
as a first-class per-org entity, not inline-per-form. Getting this right here is why the two
builders don't become two codebases.

## Schema

Reuses `submission_forms` with a widened `kind`:

```ts
kind: v.union(
  v.literal("abstract"), v.literal("session"),      // CFP
  v.literal("contact"), v.literal("group"),         // portal
  v.literal("submission_task")                      // portal, attached to a task
)
```

Plus `portalFormSettings: { sendConfirmationEmail: boolean, confirmationBody?: string }`.
Responses land in a `form_responses` table keyed by `formId` + `speakerId` (+ optional
`submissionId`), mirroring `submissions.answers`.

## Tasks

1. Widen `kind`; add portal settings
2. Admin list w/ type tabs
3. 3-step wizard (reuse the CFP wizard shell, fewer steps)
4. Field library popover: search existing · create new · add section element
5. Speaker-side renderer (reuse the CFP dynamic renderer)
6. Link a form to a task (`onboarding_tasks.linkedFormId`) — completing the form completes
   the task
7. Confirmation email on submit

## Verification

- [ ] A field created here is reusable in the CFP builder and vice versa
- [ ] Speaker completes a task-linked form → task flips to done
- [ ] Confirmation email fires when enabled
- [ ] Delete asks for confirmation

## Cut line

Droppable in full — it's downstream of acceptance and the brief mentions it only in passing
(Written Brief #8's "resource/wiki pages" is adjacent but separate). If cut, tasks stay
manual-completion only. Cut *before* cutting speaker-availability.
