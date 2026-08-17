# Self-service speaker portal user journey

**Feature:** Speaker portal for bios, headshots, slides, and supporting documents  
**Canonical route:** `/portal/profile`  
**Related plan:** [`plan.md`](./plan.md)  
**Current completion verdict:** **Not complete under the Feature User Journey rule.** The
configured Convex workflow has passed a manual browser run, but the journey below has not been
retained as a repeatable end-to-end test and the deployed release walkthrough remains open.

This document is the authority for implementation review and QA. Tests must start from a user-visible
entry point and execute the journey through the running app. Direct database, Convex dashboard, or
API manipulation may supplement this journey but cannot replace it.

## 1. User

The primary user is a returning, authenticated conference speaker managing their own public profile
and files for a proposal they submitted.

An authenticated account that does not resolve to a speaker record for the event (including an
organizer who is not themselves a speaker) sees a "No speaker profile found" notice instead of the
portal, with no ability to browse or act as another speaker. There is no picker or impersonation
path in the production app — Clerk-matched identity (by verified email) is the only way into the
portal.

## 2. Starting state

- The judged app is configured with Clerk and the Convex data backend.
- A published event exists with an open or previously used CFP form.
- The speaker has completed a CFP submission using an email address verified on their Clerk account.
- The resulting speaker record belongs to that event and has at least one linked submission.
- The speaker is signed in. If they arrive from the public submission success page, the one-hop portal
  handoff has selected the newly resolved speaker record.
- QA has an image file of 10 MB or less and two files of 10 MB or less: one slide deck and one
  supporting document.
- QA also has an image larger than 10 MB, a non-image file, and a document larger than 10 MB for
  failure checks.

The speaker must never need organizer permissions, an organizer route, a database identifier, or a
developer tool to complete the journey.

## 3. Entry points

### Primary: immediately after a CFP submission

1. The user finishes the public CFP and sees **Submission received**.
2. The success page shows **Open the speaker portal now** and, when configured, a visible ten-second
   redirect countdown.
3. The user follows the link or waits for the redirect.
4. If signed out, Clerk asks them to sign in. After authentication, the app opens the speaker portal.
5. The **Home** page greets the speaker and shows their own submission. The user selects **Profile**
   from the speaker navigation or **View more** from **My profile**.

### Returning speaker

1. The signed-in speaker opens the app's speaker portal.
2. They select **Profile** in the **Speaker portal** navigation or **Speaker profile** in the account
   menu.

Neither journey starts at `/portal/profile` by typing an undocumented route as the only means of
access. Direct-route coverage is an additional SPA/auth test.

## 4. User journey steps

1. **Resolve the speaker identity.** The user sees the shared dashboard shell and speaker navigation.
   The app matches the verified Clerk email to one speaker in the published event. A matched speaker
   cannot view or act as any other speaker — there is no picker, and no client-supplied speaker id is
   ever trusted.

2. **Confirm the owned context.** On **Home**, the user sees their name, their task summary, and only
   submissions belonging to them. They open **Profile**.

3. **Review the existing profile.** The Profile page shows **General**, **My links**, **Headshot**, and
   **Slides and documents**. Existing profile values and the current headshot are visible. The
   biography counter reflects the visible biography text and caps entry at 5,000 characters.

4. **Edit the biography and profile.** The user changes the biography, first or last name, and at
   least one public link, then selects **Save**. While the request is in flight, duplicate submissions
   must not create conflicting state.

5. **Confirm the profile save.** The user sees **Profile saved.** without leaving the page. Invalid
   names or links instead produce a visible, field-relevant error, retain the entered values, and
   allow correction and retry.

6. **Upload a headshot.** The user selects **Upload headshot**, chooses an allowed image no larger
   than 10 MB, and waits while the control reads **Uploading…**. On success the new image appears in
   the Headshot area and the user sees **Headshot uploaded.**

7. **Choose the proposal for files.** In **Slides and documents**, the user selects the intended
   submission when they own more than one. With one submission, the app selects it automatically
   and does not add an unnecessary selector.

8. **Upload slides.** The user selects **Upload slides**, chooses the slide deck, and sees
   **Slides uploaded.** The new filename appears as an openable link labelled **Slides**.

9. **Upload a supporting document.** The user selects **Upload document**, chooses the supporting
   file, and sees **Document uploaded.** The filename appears as an openable link labelled
   **Supporting document**.

10. **Open the stored files.** The user opens each filename. Each resolves to the current provider
    URL and displays or downloads the file; the app never exposes an expired persisted attachment
    URL as its durable record.

11. **Verify persistence.** The user refreshes the Profile page. The saved bio, name, links,
    headshot, slides, and supporting document remain visible. The user leaves for **Home**, returns to
    **Profile**, and sees the same state.

12. **Remove one file.** The user selects **Remove** beside the supporting document. The row
    disappears and the user sees `<filename> removed.` Refreshing does not restore it; the slides and
    headshot remain unaffected.

13. **Verify ownership boundaries.** The user cannot see another speaker in the portal, cannot see
    another speaker's submissions or files, cannot edit another speaker's proposal by changing the
    URL, and cannot enter organizer-only routes. Denial must be visible and must not reveal the other
    speaker's data.

## 5. Expected outcome

The speaker can reach the feature from the real submission/portal experience, update their own
profile, replace their headshot, upload slides and a supporting document for the correct proposal,
open those files, remove a file, refresh, and still see the saved result. They never see or mutate
another speaker's information.

## 6. Visible success state

QA must observe all of the following in the interface:

- The portal Home page shows the newly submitted or existing owned proposal.
- The Profile page is reachable through visible speaker navigation.
- **Profile saved.** appears after a profile mutation succeeds.
- The new headshot renders and **Headshot uploaded.** appears.
- **Slides uploaded.** and **Document uploaded.** appear after their respective uploads.
- Both uploaded filenames render in the list with the correct kind.
- The state survives a hard refresh and a leave-and-return cycle.
- Removing a file removes its row, shows `<filename> removed.`, and survives refresh.

A Convex row, storage object, server log, green unit test, or successful mutation response is not a
visible success state by itself.

## 7. Failure and recovery states

| Failure | What the user must see | Preservation and recovery | Current state |
|---|---|---|---|
| Signed out or expired Clerk session | Clerk sign-in, followed by return to the portal | No other speaker is selected from an unverified identity; sign in with the verified submission email | Implemented at the route boundary; exact return path needs deployed QA |
| Verified email does not match a speaker | A "No speaker profile found" notice; no picker, no fallback identity | A real speaker must correct/verify the Clerk email or ask the organizer to correct the speaker record | Implemented fail-closed |
| Invalid or empty first/last name | A visible error saying first and last name are required | All entered profile values remain on screen; correct and select **Save** again | Implemented server-side and surfaced by the page |
| Invalid profile link | A visible `<label> must be a valid http(s) URL.` error | Values remain on screen; correct the URL and retry | Implemented |
| Biography exceeds 5,000 characters | Input is capped and the counter never reports a successful over-limit save | Shorten the biography and save | Implemented in the editor and server validation |
| Non-image headshot | **Headshots must be image files.** | Existing headshot remains; choose JPEG, PNG, WebP, or GIF | Implemented client and server-side |
| Headshot larger than 10 MB | **Headshots must be 10 MB or smaller.** | Existing headshot remains; choose a smaller image | Implemented client and server-side |
| Unsupported document type | A clear supported-type error before upload | Existing files remain; choose PDF, presentation, document, or text | **Gap:** picker filters extensions, but the client/server save path does not enforce document type |
| Document larger than 10 MB | **Speaker documents must be 10 MB or smaller.** | Existing files remain; choose a smaller file | Implemented client and server-side |
| Upload transport or storage failure | A visible rejection/error message; upload state returns to idle | Existing profile/files remain; choose the file and retry | Implemented generally; an uploaded-but-unsaved storage object can be orphaned |
| Profile backend unavailable | A visible error, or explicit local-only confirmation on a backend that does not support profiles | Convex must allow retry without losing inputs; local fallback must never be presented as cross-device persistence | Partially implemented; Airtable intentionally falls back locally and is outside the judged path |
| File list load failure | **Could not load your documents.** or the backend message | The user can retry by refreshing; no destructive state change occurs | Implemented, but there is no inline Retry action |
| Remove failure | Visible error; the row stays present | Retry **Remove** after connectivity returns | Implemented |
| Refresh during upload | No false success or phantom list row | Return to Profile and retry the upload | Expected; needs browser QA |
| Back/navigation with unsaved profile edits | User must not silently assume unsaved edits were stored | Save before leaving, or receive an unsaved-change warning | **Gap:** no dirty-state warning |
| Duplicate click while saving profile | One coherent final state and no confusing success/error race | Wait for completion, then retry only if an error appears | **Gap:** the Save control is not disabled while saving |
| Attempted access to another speaker or organizer route | A denial/redirect that reveals no protected data | Return to the owned portal route; changing IDs never grants access | Server ownership checks implemented; retain exact browser denial coverage |

## 8. Persistence expectations

On the configured Convex path:

- **Refresh:** saved profile fields, headshot, slides, and documents remain.
- **Leave and return:** the same state is loaded from the backend, not reconstructed from transient
  component state.
- **Logout and login:** signing back in with the same verified email resolves the same speaker and
  state; the one-hop submission handoff is not required.
- **Second browser session:** the same saved state appears after authentication.
- **App restart/deployment restart:** durable storage IDs and database records continue to resolve to
  fresh file URLs.
- **Removal:** a removed document and its storage object stay removed after all the cycles above.
- **Headshot replacement:** the new image remains and the previous storage object is deleted.

The Airtable adapter's local profile fallback does not satisfy logout/login, second-browser, or app
restart persistence and therefore cannot be used as proof for this journey.

## 9. Frontend wiring trace

| User action | Interface and handler | Repository/backend path | Stored effect | Visible result |
|---|---|---|---|---|
| Open the portal after submitting | Submission success link/countdown → session handoff → `/portal` | `publicForms.submit` returns the resolved speaker; `speakers.getMine` verifies the signed-in email | No identity is stored from an untrusted client ID | Owned portal Home renders |
| Open Profile | Portal navigation or account menu → React Router | `speakers.getMine`, then `speakers.headshotUrl`, speaker-scoped submissions and documents | Read-only | Existing profile and assets render |
| Save profile | **Save** → `PortalProfilePage.save` | `repo.speakers.updateProfile` → `speakers:updateProfile` → `scopedOwnedSpeaker` | Speaker profile fields patched with `updatedAt` | **Profile saved.** |
| Upload headshot | Hidden labelled file input → `uploadHeadshot` → storage POST | `requestHeadshotUpload` → Convex upload URL → `saveHeadshot` → `headshotUrl` | Durable storage ID replaces prior key; prior object deleted | Image preview + **Headshot uploaded.** |
| Select proposal | Styled submission listbox → `setSubmissionId` | Subsequent document reads/writes include event, speaker, and submission | No mutation | File list changes to selected proposal |
| Upload slides/document | Labelled file input → `SpeakerDocuments.upload` → storage POST | `requestDocumentUpload` → `speakerDocuments:requestUpload`; `saveDocument` → `speakerDocuments:save`; then list reload | `speaker_documents` row stores durable storage ID, filename, kind | Success message and linked filename |
| Open file | Filename link | `speakerDocuments:list` resolves a fresh storage URL | No mutation | File opens in a new tab |
| Remove file | **Remove** → `SpeakerDocuments.remove` | `removeDocument` → `speakerDocuments:remove` | Document row and storage object deleted | Row disappears + removal message |

Every backend function in this table must remain reachable through its named UI action. Repository
or Convex coverage alone does not complete the step.

## 10. Required QA execution

Run sections 3–8 start to finish in a configured, seeded app through a real browser. Retain evidence
that includes the visible success messages and the post-refresh state. At minimum, repeat the
journey at desktop and 375 px mobile width, then run these isolation checks with two distinct
speaker identities:

1. Speaker A completes the full profile and file journey.
2. Speaker A refreshes, logs out/in, and confirms persistence.
3. Speaker B signs in and cannot see Speaker A's submissions, profile assets, or files.
4. Speaker B attempts Speaker A's edit URL and is denied without data disclosure.
5. A speaker attempts an organizer route and is denied or redirected.
6. QA runs every failure row marked **Implemented** and records the visible recovery behavior.
7. Gaps in section 7 are fixed or explicitly accepted before this feature changes from
   `in-progress` to `done`.

