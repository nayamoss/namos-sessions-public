# Account Menu — Imori Parity — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)
No existing table covers changelog entries or feedback. `convex/schema.ts` has `notifications`
(per-event, per-recipient activity events — not a product-wide changelog) and nothing for
feedback at all.

### Required Changes
| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| `changelogEntries` | CREATE | `title` | `v.string()` | — |
| `changelogEntries` | CREATE | `body` | `v.string()` | markdown or plain text, render as plain text initially |
| `changelogEntries` | CREATE | `status` | `v.union(v.literal("draft"), v.literal("published"))` | mirrors Imori's `projectUpdates.status` |
| `changelogEntries` | CREATE | `publishedAt` | `v.optional(v.number())` | ms epoch, set on publish |
| `changelogEntries` | CREATE | `createdAt` | `v.number()` | ms epoch |
| `changelogEntries` | INDEX | `by_status_publishedAt` | on `["status", "publishedAt"]` | list query sorts published desc |
| `feedback` | CREATE | `userId` | `v.string()` | Clerk subject, from `ctx.auth.getUserIdentity()` — never client-supplied |
| `feedback` | CREATE | `rating` | `v.union(v.literal("excellent"), v.literal("good"), v.literal("okay"), v.literal("poor"))` | — |
| `feedback` | CREATE | `note` | `v.optional(v.string())` | free text, optional |
| `feedback` | CREATE | `createdAt` | `v.number()` | ms epoch |
| `feedback` | INDEX | `by_createdAt` | on `["createdAt"]` | for future admin review, not built in this pass |

### Migration
Both are new tables — additive only, no backfill. **Per the global "Database Caution" rule this
schema addition needs Naya's explicit confirmation before `convex/schema.ts` is touched, even
though it's additive and low-risk** — flagging here rather than assuming approval from this plan
alone.

---

## Backend / API
### Affected Existing Endpoints
None modified.

### New Endpoints (Convex functions, not REST — this app has no Next.js API routes)
| Function | Kind | Args | Returns |
|----------|------|------|---------|
| `changelog.list` | query | `{ limit?: number }` | published entries, newest first |
| `changelog.create` | mutation | `{ title: string, body: string, status: "draft"\|"published" }` | entry id — organizer-role gated, for manual/dashboard use only in this pass |
| `feedback.submit` | mutation | `{ rating: "excellent"\|"good"\|"okay"\|"poor", note?: string }` | `{ ok: true }` — `userId` derived server-side from `ctx.auth.getUserIdentity()`, never taken from args |

### Validation & Business Logic
- `feedback.submit` throws if `ctx.auth.getUserIdentity()` is null (must be signed in).
- `changelog.list` only returns `status: "published"` rows; no public endpoint exposes drafts.

---

## Frontend Components
### Modified Components
| File Path | Change |
|-----------|--------|
| `src/components/AccountMenu.tsx` | Add 4 new `DropdownMenuItem`s (What's new / Take a tour / Feedback / Shortcuts) above the existing `ThemeToggleMenuItem`, in both the collapsed and expanded render branches. Import icons `Megaphone`, `Route`, `MessageSquare`, `Keyboard` from `lucide-react` (already a dependency). |
| `src/components/GlobalKeyboardShortcuts.tsx` | Lift `helpOpen` state trigger to also respond to a `window` custom event (`namos:open-shortcuts`), mirroring the existing `VOICE_TOGGLE_EVENT` pattern already used in this same file for Alt+V. No dialog rebuild — reuse what's there. |
| `src/App.tsx` | Add lazy route `/updates` → new `UpdatesPage`, outside the event-scoped route tree (this is product-wide, not per-event). |

### New Components

**`OnboardingTourStore`** (not a component, a Zustand store)
- File: `src/lib/onboardingTourStore.ts`
- Shape: `{ hasTakenTour: boolean; isTourActive: boolean; tourStep: number; startTour(): void; endTour(): void; nextTourStep(): void; prevTourStep(): void; resetTour(): void }`
- Persistence: `zustand/middleware persist`, localStorage key `namos-onboarding-tour`, `partialize` keeps only `hasTakenTour` — `isTourActive`/`tourStep` are session-only, ported directly from Imori's `partialize` pattern.

**`TourOverlay`**
- File: `src/components/tour/TourOverlay.tsx`
- Props: none — reads from `useOnboardingTourStore()` directly.
- Location: rendered once at the root of `AppLayout.tsx`, same level as `GlobalKeyboardShortcuts` and `CommandPalette`.
- Elements:
  - Full-screen click-to-dismiss underlay (`fixed inset-0`, ends tour on click)
  - Spotlight cutout via `box-shadow: 0 0 0 9999px rgba(0,0,0,0.5)` positioned at the target's `getBoundingClientRect()` (no actual DOM clipping, matches Imori's trick exactly)
  - Tooltip card: headline, body text, step counter (`n / TOTAL`), progress dots, Back button (hidden on step 1), Next button (reads "Done" on the last step)
  - Empty/degenerate state: if `document.querySelector(step.targetSelector)` returns null (route doesn't currently render the target), the overlay renders nothing for that step rather than showing a blocking underlay with no target — same as Imori.
- Behavior: `Escape` ends the tour; clicking the underlay ends the tour; Next/Back call the store's `nextTourStep`/`prevTourStep`; `ResizeObserver` on the target element and `window resize` re-measure position on layout shifts.
- Data: no network calls, pure client state via the store above.

**`TOUR_STEPS`**
- File: `src/lib/tourSteps.ts`
- Shape: array of `{ id: string; targetSelector: string; headline: string; body: string; placement: "right"|"bottom"|"left" }` — content rewritten for this app's actual UI (event list, program tabs, settings, portal switch — not Imori's writing-tool areas like "canvas"/"drafts"). Exact copy is a content decision to make during implementation, not blocking the plan.
- New `data-tour="tour-*"` attributes need adding to the sidebar nav items / dashboard sections these steps target — touches `src/components/AppLayout.tsx` and/or the sidebar nav item components.

**`FeedbackDialog`**
- File: `src/components/FeedbackDialog.tsx`
- Props: `{ open: boolean; onOpenChange: (open: boolean) => void }`
- Location: rendered from `AccountMenu.tsx`, opened via local `useState`, mirrors `ProfileSettingsDialog`'s existing open/close pattern in the same file.
- Elements: shadcn `Dialog`, `RadioGroup` with 4 options (Love it / Good / Okay / Needs work), optional `Textarea` for free text, Cancel + Submit buttons, inline error text on failure (no border/shadow — standard `Dialog` primitive already matches design system).
- Behavior: Submit calls the `feedback.submit` Convex mutation; disables the submit button while in flight; shows a brief inline confirmation ("Thanks — got it.") then auto-closes after ~1.2s.
- Data: writes to the new `feedback` Convex table via the mutation above.

**`UpdatesPage`**
- File: `src/pages/Updates.tsx`
- Location: `/updates` route, standalone page (not inside the event-scoped layout — a user should be able to read it without an active event selected).
- Elements: page header "What's new", list of cards (one per changelog entry: title, date, body text), empty state ("Nothing published yet" + icon) if the list is empty, loading skeleton rows while the Convex query resolves.
- Data: reads `changelog.list` query.

---

## State / Data Flow
- Tour: Zustand store (client-only) → `TourOverlay` subscribes directly → no Convex involvement.
- Feedback: `FeedbackDialog` local form state → Convex mutation on submit → no local cache needed (write-only UI, no list view in this pass).
- Updates: Convex `useQuery(api.changelog.list)` → `UpdatesPage` renders directly; Convex's own reactivity handles refresh, no manual refetch logic needed.
- Shortcuts: unchanged data flow — `GlobalKeyboardShortcuts` already owns its own state; only its trigger surface grows (custom event in addition to the `?` key).

---

## Auth / Permissions
- `feedback.submit`: any signed-in user (organizer or speaker context) — identity from `ctx.auth.getUserIdentity()`.
- `changelog.create`: organizer/admin role only, via the same guard pattern already used elsewhere in `convex/` for role checks (see repo's existing `assertAdmin`/equivalent — reuse it, don't write a new one). Not exposed in any UI in this pass; called manually via Convex dashboard/CLI until an authoring UI is built.
- `changelog.list` / `/updates` page: no auth required — same as Imori's public marketing route.
- Tour and Shortcuts: no permission checks, available to any authenticated user (Tour reads `data-tour` attributes on the admin shell, so it's only meaningful in the `context="admin"` account-menu variant, matching where Imori's own tour lives — dashboard, not portal).

---

## Edge Cases & Error States
- Feedback submit fails (network/Convex error): inline red error text below the form, submit button re-enabled, form contents preserved (not cleared).
- Tour target element not present on current route: that step is skipped silently (renders nothing), does not error or block Next/Back.
- `/updates` with zero published entries: empty state, not a blank page.
- Shortcuts custom event fires while the dialog is already open: idempotent, no-op re-open.

---

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Feedback backend | New Convex table, write-only from client | Imori's own `/api/feedback` route doesn't exist (404s) — nothing to actually port; a plain Convex mutation is the smallest correct implementation and matches this app's existing data layer instead of introducing a Next.js-style API route this app doesn't have. |
| Shortcuts dialog | Reuse existing `GlobalKeyboardShortcuts`, add event trigger only | This app already has a complete, working shortcuts help dialog — porting Imori's 400-line rebindable version would duplicate functionality and introduce a second, conflicting shortcuts system. |
| Tour state persistence | Client-only (localStorage), no Convex table | Matches Imori's own behavior exactly (`partialize` keeps it out of the server round-trip) — no reason to diverge, and it avoids adding a `tourState` column to `users`/`userProfiles` for a low-stakes UI preference. |
| Zustand | New dependency, scoped to tour only | Matches Imori's own usage pattern (single store, not house-wide) — avoids introducing a second state-management convention into an app that otherwise uses Context + Convex hooks. |

## Dependencies
**Requires:** none — independent of the settings-modal-refactor work.
**Enables:** the "Account" menu item (already present) will eventually open the new settings modal from `docs/features/settings-modal-refactor/` instead of navigating to `/events/:slug/settings/event` — tracked there, not here.

## Risks & Mitigations
- **Risk:** Convex schema changes require explicit confirmation per global CLAUDE.md rule. **Mitigation:** flagged above; implementer must confirm the `changelogEntries`/`feedback` schema with Naya before running `convex deploy` against either table, not just before writing the `defineTable` call.
- **Risk:** Tour steps reference DOM elements (`data-tour` selectors) that don't exist yet in this app's markup. **Mitigation:** adding those attributes is an explicit task in plan.md, not assumed to already be present.
