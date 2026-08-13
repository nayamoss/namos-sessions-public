# Speaker Portal

**Phase 4 · ~5-6h** · Screenshots: *Speaker portal after submission*, *Profile* (brief p.16-17)

Routes: `/portal`, `/portal/submissions`, `/portal/submissions/new`, `/portal/profile`, `/portal/tasks` · Speaker auth

**Authoritative user journey and QA path:** [`USER_JOURNEY.md`](./USER_JOURNEY.md). This plan is
not complete, and the feature must not be marked `done`, until that journey passes through the
configured running app.

## Goal

Where the post-submission auto-redirect lands. Self-service status, sessions, bio, and tasks.

swyx annotated the profile screen **"update your own bio data"** — self-service editing is a
called-out expectation, not incidental.

## Screens

**Shared dashboard shell:** the portal uses the same floating sidebar, title row, unified content
surface, spacing, collapse behavior, and account placement as admin. Its speaker navigation is
Home | Submissions | Profile | Availability | Schedule | Tasks. The account menu includes Profile,
**Back to Admin Mode**, theme, and Logout.

> **"Back to Admin Mode" implies admin→speaker impersonation.** Worth supporting — it's how
> the demo gets driven, and it lets a judge see the portal without a second account.

### Home
- **My Submissions (N)** card, `View All` link. Rows: `SESS-4 – sd`, session type
  ("Featured Keynote", "Keynote"), status pill — **Accepted** green / **Pending** amber.
- **My Profile** card — avatar, name, email, `View more`.
- **Tasks** card — tabs All / My Tasks (N) / Submissions (N); sections **Submission Tasks**
  and **My Tasks**; Open All / Collapse All; Filter.

### Profile
Left: **General** — Biography (rich text, `0 / 5,000 characters`), Salutation, First Name,
Last Name, Honorific, Pronouns, Gender.
Right: **My Links** — LinkedIn URL, X (Twitter) URL, Facebook URL, Website.

### Submissions
- The submissions page has a dedicated toolbar below the identity-only page title with a
  **New submission** action.
- `/portal/submissions/new` lists the event's currently open, unexpired abstract/session CFP
  forms and links into the existing public submission flow. Closed, expired, draft, and internal
  forms are excluded server-side.
- Loading, unavailable-backend, and no-open-call states remain explicit; the empty submissions
  state repeats the primary action so a first-time speaker is never stranded.

## Schema

```ts
speakers: defineTable({
  userId: v.optional(v.string()),        // Clerk id, set when the account is created
  email: v.string(),
  firstName: v.string(), lastName: v.string(),
  bio: v.optional(v.string()),           // rich text, 5000 cap
  headshotUrl: v.optional(v.string()),   // R2/Convex storage — NEVER an Airtable attachment URL
  title: v.optional(v.string()), company: v.optional(v.string()),
  mobilePhone: v.optional(v.string()),
  salutation: v.optional(v.string()), honorific: v.optional(v.string()),
  pronouns: v.optional(v.string()), gender: v.optional(v.string()),
  linkedinUrl: v.optional(v.string()), xUrl: v.optional(v.string()),
  facebookUrl: v.optional(v.string()), websiteUrl: v.optional(v.string()),
  createdAt: v.number(), updatedAt: v.number(),
})
  .index("by_email", ["email"]).index("by_user", ["userId"]),

speaker_documents: defineTable({
  submissionId: v.id("submissions"), speakerId: v.id("speakers"),
  kind: v.union(v.literal("slides"), v.literal("supporting_doc")),
  fileUrl: v.string(), fileName: v.string(),
  createdAt: v.number(),
}).index("by_submission", ["submissionId"]).index("by_speaker", ["speakerId"]),
```

## Tasks

1. `SpeakersRepo`: `getMyProfile`, `updateMyProfile`, `listMySubmissions`
2. Link the Clerk user to a `speakers` row by email on first portal load
3. Configure the shared dashboard shell with speaker-specific navigation and account links
4. Home: three cards
5. Profile: General + My Links, 5000-char counter on bio
6. Headshot + document upload
7. Admin → speaker impersonation ("Back to Admin Mode" round-trip)
8. Speaker-initiated proposal creation from the submissions toolbar and open-CFP chooser

## Verification

- [ ] Auto-redirect from submission lands here with the new submission listed
- [ ] Bio edit persists and shows on the public speaker gallery (if embeds are built)
- [ ] Status pills reflect real submission status incl. the queue states
- [ ] A speaker sees **only** their own submissions
- [ ] Impersonation round-trips without losing the admin session
- [x] A speaker can start a new proposal from `/portal/submissions` without an organizer-only form query

## Cut line

Keep Home + Profile. Droppable: impersonation, document upload, the separate Submissions tab
(Home's card can carry it).
