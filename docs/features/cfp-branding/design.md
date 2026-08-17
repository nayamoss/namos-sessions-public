# CFP Submission Page Branding — Technical Design

## Reference implementations (cross-repo research)
- `notara-webapp/pages/Branding.tsx` + `notara-webapp/convex/settings.ts` — closest scope match:
  logo upload, primary color, live split-screen preview, Convex-backed. Model the builder UI's
  layout (form on one side, live preview on the other) on this.
- `enso-main/enso-webapp`: `components/admin/widget-customizer.tsx` → `app/api/widgets/code/route.ts`
  → `app/embed/[orgId]/feedback-widget/page.tsx` — the cleanest proven "DB color field → builder
  color picker → public page inline style" pipeline. We follow this shape but apply the color via
  this app's existing `--primary` HSL CSS variable convention instead of ad hoc inline styles,
  since `SubmissionPage.tsx` already themes everything through `bg-primary` / `variant="accent"`.
- `naya-pw-20/lib/theme-builder-store.ts` — richer multi-property `Theme` type (colors/fonts/
  radius/spacing). Explicitly not used for v1 (see Out of Scope) — noted here only as the natural
  extension point if a future version adds fonts or multiple colors.

## Database / Schema Changes

### Current Schema (`convex/schema.ts`, `events` table)
```ts
events: defineTable({
  organizationId: v.optional(v.id("organizations")),
  name: v.string(), slug: v.string(), type: v.optional(v.string()), websiteUrl: v.optional(v.string()),
  location: v.optional(v.string()), timezone: v.string(), startDate: v.number(), endDate: v.number(),
  description: v.optional(v.string()), contactEmail: v.optional(v.string()), logoFileId: v.optional(v.string()),
  programPublishedAt: v.optional(v.number()),
  theme: v.optional(v.string()), logoStorageKey: v.optional(v.string()), backgroundStorageKey: v.optional(v.string()),
  exhibitorsEnabled: v.boolean(), sponsorsEnabled: v.boolean(), defaultOnboardingTemplateId: v.optional(v.id("task_templates")),
  billingOwnerUserId: v.optional(v.string()),
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_slug", ["slug"]).index("by_organization", ["organizationId"]),
```
Important correction from initial assumption: `theme` is a free-text field (max 1000 chars, see
`src/pages/settings/EventDetails.tsx:316`, `CharCounterInput`) — organizers use it for a
human-readable "conference theme" (e.g. "Innovation 2026"), NOT a color. It must not be reused
for accent color. `logoStorageKey` already exists and is already accepted by the `events` update
mutation (`convex/events.ts` `eventFields`), but no UI anywhere writes to it today.

### Required Changes
| Table  | Action      | Column/Index  | Type                     | Notes |
|--------|-------------|---------------|--------------------------|-------|
| events | ADD COLUMN  | accentColor   | `v.optional(v.string())` | Hex string, e.g. `#F58E63`. Validated client-side (valid 6-digit hex) and clamped server-side to a string of max length 9 (`#RRGGBBAA` or `#RRGGBB`). |

No index changes. No changes needed to `logoStorageKey` — it already exists.

### Migration
Convex schema changes are additive and require no explicit migration step — `accentColor` is
optional, so existing event documents are valid as-is the moment the schema file is deployed.

---

## Backend / API

### Affected Existing Endpoints
| Function | File | Change |
|----------|------|--------|
| `events` update mutation | `convex/events.ts` | Add `accentColor: v.optional(v.string())` to `eventFields`. No other change — `logoStorageKey` is already in `eventFields`. |
| `publicForms.get` (query) | `convex/publicForms.ts` | Resolve `event.logoStorageKey` to a URL (mirror `safeHeadshotUrl` from `convex/publicEmbeds.ts:177-187`) and include it plus `event.accentColor` in the returned `event` object. |

### New Endpoints
None. `convex/files.ts`'s `generateUploadUrl` mutation and `getUrl` query already exist and are
reused as-is for the logo upload.

### Validation & Business Logic
- `accentColor`, when present, must match `^#[0-9a-fA-F]{6}$` — reject/ignore otherwise in the
  builder UI before saving (client-side is sufficient here; this is cosmetic data, not
  security-sensitive, consistent with how `theme` is handled today with no server validation).
- Logo upload: reuse the existing auth gate on `generateUploadUrl` (`requireIdentity`) — no new
  auth surface. No file-type/size validation currently exists for any other upload in this repo
  (e.g. speaker headshots) — match that precedent, don't add new constraints as part of this
  feature.

---

## Frontend Components

### Modified Components
| File Path | Change |
|-----------|--------|
| `src/pages/program/SubmissionFormBuilder.tsx` | Add an "Appearance" step to the wizard (logo upload + color picker + live preview). |
| `src/pages/public/SubmissionPage.tsx` | Render event logo in place of text wordmark when present; apply `accentColor` as scoped `--primary`/`--primary-foreground` CSS vars on the page root. |
| `src/data/types.ts` | Add `logoUrl?: string` and `accentColor?: string` to `PublicSubmissionFormConfig`'s `event` shape; add `accentColor?: string` to the `Event` interface. |
| `src/data/repo.ts` | Pass through the two new fields from the Convex query result — no signature change to the `PublicSubmissionFormConfig` fetch method itself. |
| `convex/publicForms.ts` | See Backend section above. |
| `convex/events.ts` | Add `accentColor` to `eventFields`. |
| `convex/schema.ts` | Add `accentColor: v.optional(v.string())` to the `events` table. |

### New Components

**`AppearanceStep`** (new step component, colocated in `SubmissionFormBuilder.tsx` alongside the
existing step components — follow how `welcome`/`settings` steps are already structured in that
file rather than extracting a separate file, to match the existing pattern)
- Props: `event: Event`, `onUpdate: (patch: Partial<Event>) => void` (mirrors how other builder
  steps mutate the draft event/form in that file today)
- Location: `SubmissionFormBuilder.tsx` wizard, new step added to the `steps` array
  (`src/pages/program/SubmissionFormBuilder.tsx:118-126`) — insert after `"welcome"`, before
  `"abstract"`, labeled "Appearance".
- Elements:
  - Section heading "Appearance" + helper text: "Add your event's logo and accent color to the
    submission page speakers will see."
  - Logo upload: drag-and-drop / click-to-browse file input (image files only), showing the
    current logo thumbnail once uploaded, with a "Remove" button (clears `logoStorageKey`).
    Loading state while the file uploads (spinner over the thumbnail area). Error state: inline
    red text below the input if upload fails ("Couldn't upload image — try again").
  - Accent color: a color swatch button that opens the browser's native color input, plus a text
    `Input` showing/accepting the hex value directly (mirrors `notara-webapp/pages/Branding.tsx`'s
    swatch + hex text input pairing). "Reset to default" link/button clears `accentColor`.
  - Live preview card (`cardSurfaceClasses`, matching the rest of the builder's card styling):
    a miniature non-interactive replica of the public page chrome — wordmark (logo or text +
    accent dot), a static progress bar filled to ~40%, and a disabled button styled like
    `PrimaryButton` — all three re-themed live as the organizer edits the logo/color, exactly
    mirroring what `SubmissionPage.tsx` will actually render.
  - Empty state: no logo/color set → preview shows today's default (text wordmark, default
    theme), same as the public page's fallback.
- Behavior:
  - Selecting a file immediately calls `generateUploadUrl`, uploads, then calls the event update
    mutation with the returned storage id — same optimistic pattern used elsewhere in this
    builder for other event fields.
  - Typing/selecting a color updates local draft state immediately (live preview updates on every
    keystroke) and persists via the same debounced/on-blur save pattern the rest of the builder
    already uses for text fields (see `update()` handlers in `EventDetails.tsx` for precedent).
- Third-party: none new — plain `<input type="color">` + `<input type="file">`, no upload library.

---

## State / Data Flow
- **Builder side:** `SubmissionFormBuilder.tsx` already holds a draft `StoredForm`/event-adjacent
  state and saves via the existing repo mutation calls in that file. The Appearance step reads
  `event.logoStorageKey` / `event.accentColor` off the current event record (via `useCurrentEvent`,
  already imported in this file) and writes back through the same event-update path other event
  fields use.
- **Public page side:** `SubmissionPage.tsx` calls `useRepo().getPublicSubmissionForm(...)` (or
  equivalent, per `src/data/repo.ts:580`) which now returns `logoUrl`/`accentColor` on `event`.
  On mount/data-load, a small `useMemo` converts `accentColor` (hex) → HSL triplet string and sets
  it via inline `style` on the page's outermost wrapper div (`style={{ '--primary': hsl, '--primary-foreground': fgHsl }}`)
  — CSS custom properties cascade to all descendants, so `bg-primary` / `variant="accent"` usages
  throughout the page (progress bar, wordmark dot, `PrimaryButton`) pick it up with zero changes
  to those components' class names.
- No new global state/store — everything flows through existing Convex query → React Query cache
  → component props, same as today.

---

## Auth / Permissions
- Builder Appearance step: same access control as the rest of `SubmissionFormBuilder.tsx` (event
  organizer role) — no new permission check needed, it's just two more fields on an already-gated
  page.
- Logo upload: gated by `requireIdentity` in `convex/files.ts` (already in place).
- Public CFP page: unauthenticated by design (it's the public submission page) — `logoUrl` is a
  world-readable Convex storage URL, same trust model as speaker headshots already exposed via
  `convex/publicEmbeds.ts`.

---

## Edge Cases & Error States
- No logo, no accent color set → page renders exactly as it does today (text wordmark, default
  `--primary`). This is the current behavior for every existing event and must not change.
- Logo set, no accent color → logo renders, colors stay default.
- Accent color set, no logo → text wordmark still renders, but themed with the accent color.
- Invalid/malformed `accentColor` string reaching the page (shouldn't happen given client
  validation, but defensively): fall back to default `--primary`, don't crash on a bad `hsl()`
  conversion — wrap the hex→HSL conversion in a try/catch-equivalent guard (regex validate before
  converting; skip the style override entirely if it doesn't match `^#[0-9a-fA-F]{6}$`).
- Logo upload failure (network error, storage error): inline error text in the builder, previous
  logo (if any) stays in place — never silently clear an existing logo on a failed re-upload.
- Very wide/tall logo images: cap displayed height via CSS (e.g. `max-h-10`) in both the builder
  preview and the public page header so layout never breaks regardless of the uploaded image's
  aspect ratio.

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where accent color applies | Reuse existing `--primary`/`--primary-foreground` CSS vars, scoped via inline `style` on the page root | `SubmissionPage.tsx` already themes everything through `bg-primary`/`variant="accent"` — zero component changes needed vs. inventing a parallel `--cfp-accent` var and touching every usage site |
| Color model | Single hex accent color only | Matches SessionBoard's actual submit page and the requirements' explicit v1 scope; avoids building a multi-property theme system (`naya-pw-20`'s theme builder) for a need that doesn't exist yet |
| Logo storage | Convex file storage via existing `generateUploadUrl`/`logoStorageKey`, not a pasted URL | User explicitly chose real upload over URL-paste; also matches how `logoStorageKey` was clearly designed to be used (already consumed read-side in `publicEmbeds.ts`) |
| `theme` field | Left untouched, not reused | It's a pre-existing free-text "conference theme" field with real organizer-facing UI (`EventDetails.tsx`) — repurposing it for color would corrupt existing data and break that UI |

## Dependencies
- **Requires:** Nothing — all backing infrastructure (`logoStorageKey`, `generateUploadUrl`,
  `getUrl`, the `events` update mutation) already exists.
- **Enables:** Future richer theming (fonts, secondary colors, background image via the already-
  unused `backgroundStorageKey`) can build on this same CSS-var injection point without rework.

## Risks & Mitigations
- **Risk:** A poorly-chosen accent color makes button text illegible.
  **Mitigation:** Compute `--primary-foreground` from the chosen color's luminance (simple
  relative-luminance threshold → black or white foreground), not left to the organizer to also
  pick a matching foreground color.
- **Risk:** Regression on existing events' public pages.
  **Mitigation:** Both new fields are optional and the page's rendering only diverges from today
  when they're present — covered explicitly in Edge Cases above and in acceptance criteria.
