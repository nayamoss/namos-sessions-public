# Public Embeds — Implementation Plan

**Depth:** FULL

**Type:** Feature

**Priority:** Medium

**Status:** In Review
**Last Updated:** 2026-08-12

This plan restores a feature that was deliberately cut when requirement #9 was struck from the
original product scope. The 2026-08-12 decision to build embeds supersedes that cut. The current
safe public projection is retained; the organizer CMS workflow and persisted configuration are the
missing product surface.

## Phase 1: Planning and Source-of-Truth Reconciliation

- [ ] T001: At implementation start, update `docs/features/INDEX.md` from `planned` to
  `in-progress`. Preserve the historical cut-log row and its 2026-08-12 restoration note rather
  than erasing the earlier competition decision.
- [ ] T002: Keep `docs/ROADMAP.md`, `docs/UI-INVENTORY.md`, `docs/PAGES.md`, and
  `docs/DESIGN-SYSTEM.md` aligned with the canonical `/cms/embeds`, `/cms/embeds/new`,
  `/cms/embeds/:embedId`, and `/embed/:embedId` routes as implementation lands.
- [ ] T003: Keep all four existing direct `/e/:eventSlug/:feed` pages from PR #63 working
  until all existing links are migrated; do not make those routes configurable or expose them in
  the new CMS list.

## Phase 2: Domain Model and Repository Contract

- [ ] T004: Add the `embeds` table and indexes from `design.md` to `convex/schema.ts`; this is a
  new-table-only migration with no backfill.
- [ ] T005: Add `EmbedId`, `EmbedView`, `EmbedTheme`, `EmbedFieldOptions`, `Embed`, `EmbedWrite`,
  and `PublicEmbedView` types to `src/data/types.ts` exactly as specified in `design.md`.
- [ ] T006: Expand `PublicEmbedsRepo` in `src/data/repo.ts` with organizer `list`, `getAdmin`,
  `preview`, `save`, `duplicate`, and `remove` operations plus public `getPublic`.
- [ ] T007: Add the matching operation names and mappings to `src/data/transport.ts` and
  `src/data/convex/index.ts`.
- [ ] T008: Update `src/data/airtable/index.ts` to fail closed for every `embeds.*` operation with
  the exact message `Public embed management is available on the Convex backend.`; do not route
  unauthenticated public reads through the Clerk-protected Airtable bridge.

## Phase 3: Convex Organizer CRUD and Public Projection

- [ ] T009: Replace the single-purpose `convex/publicEmbeds.ts` module with the complete functions
  in `design.md`: `list`, `getAdmin`, `preview`, `save`, `duplicate`, `remove`, `getPublic`, while preserving
  the existing safe URL and headshot projection helpers.
- [ ] T010: Validate name trimming/length, supported view/theme, hex color, field-option shape,
  track ownership, and event ownership before writing.
- [ ] T011: Generate embed IDs only from Convex document IDs. Never place event IDs, speaker IDs,
  submission IDs, or agenda-item IDs in the public route or response.
- [ ] T012: Build the public view projection server-side according to the saved embed view,
  selected tracks, and selected fields. Reject disabled embeds, unpublished events, and missing
  records with `null`.
- [ ] T013: Keep public URLs restricted to `http:`/`https:` and resolve headshot storage IDs to
  fresh provider URLs on each public read.
- [ ] T014: Add seed records in `convex/seed.ts`: enabled `Main event agenda` and disabled
  `Speaker gallery draft`, both attached to the seeded published event.

## Phase 4: Shared Embed Utilities

- [ ] T015: Replace `src/lib/public-embed.ts` with helpers for `/embed/:embedId` URL generation,
  iframe snippet generation, hex validation, view labels, required/optional field maps, and default
  configuration. Helpers must be pure and fully unit-tested.
- [ ] T016: Generate a snippet containing a descriptive `title`, `loading="lazy"`, `width="100%"`,
  view-appropriate numeric `height`, `style="border:0;width:100%;"`, and
  `referrerpolicy="strict-origin-when-cross-origin"`.
- [ ] T017: Do not add a new package. Use existing React, React Router, lucide-react, shadcn/Radix,
  Tailwind, Convex, and `navigator.clipboard` APIs already present in `package.json`.

## Phase 5: Frontend UI — CMS Embed List

> A feature is not done until an organizer can reach and use it from the sidebar.

### UI Spec: `EmbedsListPage`

- **File:** `src/pages/cms/EmbedsListPage.tsx`
- **Props:** none; it resolves the active event with `useRepo().events.list()` and loads saved
  embeds with `useRepo().publicEmbeds.list({ eventId })`.
- **Route/location:** sidebar `CMS` section > `Embeds` > `/cms/embeds`.
- **Shell:** `<AppLayout title="Embeds">` containing `space-y-3` content.
- **Status tabs:** shared `StatusTabs`, one horizontal row: `All {count}`, `Enabled {count}`,
  `Disabled {count}`. Switching tabs filters the already-loaded array.
- **Toolbar:** shared `ContentToolbar` with search placeholder `Search by name, view, or ID…` and
  one coral `Add embed` button using `variant="accent" size="sm"` plus `Plus` icon.
- **Format group:** `section.rounded-lg.bg-muted/40.p-4`; heading row has `Code2` icon,
  `Styled HTML`, count, and a collapse/expand ghost icon button.
- **Embed cards:** responsive `grid gap-4 sm:grid-cols-2 xl:grid-cols-3`. Each
  `article.rounded-lg.bg-background.p-4` contains internal name, view label, monospaced short ID,
  Enabled/Disabled status badge, `Copy` ghost icon button, and canonical `dropdown-menu` actions:
  Edit, Duplicate, Enable/Disable, Delete.
- **Loading:** `SkeletonList rows={3} label="Loading embeds…"`.
- **Empty—all:** centered `py-12` with `No embeds yet`, helper `Create an embed to publish your
  agenda, sessions, or speakers on another website.`, and `Add embed` action.
- **Empty—search/filter:** centered `py-12` with `No embeds match these filters.` and `Clear
  filters` ghost action.
- **Error:** inline `role="alert"`, `rounded-lg bg-destructive/10 px-4 py-3 text-sm
  text-destructive`, exact text `Embeds could not be loaded. Try again.` plus Retry action.
- **Delete confirmation:** inline `rounded-lg bg-muted p-4` panel, not a modal. Text `Delete
  “{name}”? Websites using this embed will show an unavailable message.` with Delete and Cancel.
- **Behavior:** row/card click and Edit navigate to `/cms/embeds/:embedId`; Add navigates to
  `/cms/embeds/new`; Copy writes the generated snippet and shows toast `Embed code copied`;
  Duplicate calls the repository, inserts the disabled copy into local state, and navigates to its
  editor; enable/disable saves immediately and updates counts.

### Tasks

- [ ] T018: Add a `CMS` nav section to `src/components/AppLayout.tsx` with `Embeds` using the
  `Code2` icon. It must remain visible and labeled in expanded mode and have the canonical tooltip
  behavior in collapsed mode.
- [ ] T019: Add the lazy `/cms/embeds` route in `src/App.tsx`.
- [ ] T020: Build `EmbedsListPage` with every element and state above.
- [ ] T021: Verify search, tabs, collapse group, copy, duplicate, toggle, delete/cancel, empty,
  loading, and error states through the browser.

## Phase 6: Frontend UI — Embed Editor

### UI Spec: `EmbedEditorPage`

- **File:** `src/pages/cms/EmbedEditorPage.tsx`
- **Props:** none; reads optional `embedId` from React Router and loads active event, rooms/tracks,
  and the existing embed when editing.
- **Routes/location:** `/cms/embeds/new` and `/cms/embeds/:embedId`.
- **Shell:** `<AppLayout title={embed?.name || "New embed"}>`; a `ContentToolbar` contains Back,
  Save, and for saved records Open public page. Save is the sole accent button.
- **Workspace:** `grid min-h-[640px] gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]`.
  On smaller screens settings render above preview; no overlay or fixed detail panel.
- **Settings card:** `rounded-lg bg-muted/40 p-4 space-y-4` with accordion sections built from the
  existing `accordion.tsx`.
- **Type section:** visible Name label/input/required marker/helper; Enabled label plus existing
  `Switch`; View `Select` containing the five view choices with one-line descriptions; Format card
  labeled `Styled HTML`, text `Responsive iframe that reads current published event data.`, and a
  `Locked` badge.
- **Style options:** Theme `Select` for Light/Dark/System; Primary color text input with adjacent
  `<input type="color">`; Date format select (`weekday_long`, `weekday_short`, `numeric`); Time
  format select (`12_hour`, `24_hour`). No raw CSS textarea.
- **Filters:** Track multi-select built with existing Popover + Command + Checkbox. Summary shows
  `All tracks` or `{n} tracks selected`; selected tracks render removable neutral chips.
- **Field options:** three labeled groups—Agenda, Session, Speaker. Required checkboxes are checked
  and disabled with `Required`; optional checkboxes toggle. Irrelevant groups are hidden based on
  the selected view. Exact field map is in `design.md`.
- **Validation:** Name error `Enter an embed name.`; color error `Use a six-digit hex color such as
  #E56B5D.`; missing event error `Create an event before creating an embed.` Save is disabled while
  invalid or saving.
- **Unsaved state:** changing any setting shows `Unsaved changes` next to Save. Browser navigation
  is not blocked in v1; Back with dirty state reveals an inline confirmation panel with Stay and
  Leave without saving.
- **Save success:** repository `save` returns ID; new route is replaced with
  `/cms/embeds/{id}`; toast `Embed saved`; dirty state clears.
- **Save failure:** keep all draft state and show inline `Embed could not be saved. Try again.`.

### UI Spec: `EmbedPreviewPanel`

- **File:** `src/components/embeds/EmbedPreviewPanel.tsx`
- **Props:** `{ embedId?: EmbedId; draft: EmbedWrite; event: Event; mode: "preview" | "code";
  onModeChange: (mode: "preview" | "code") => void }`.
- **Header controls:** accessible Preview/Get code `Tabs`; view select mirroring the draft view;
  Desktop and Mobile toggle buttons with `Monitor`/`Smartphone`; Reload ghost button; Open button
  disabled until saved.
- **Preview frame:** `rounded-lg bg-background p-3`; desktop width fills panel; mobile frame uses
  `mx-auto max-w-[375px]`. New/dirty records render `<EmbedRenderer>` from draft plus fetched safe
  event projection. Saved/clean records use the real `/embed/:embedId` iframe so deployment-header
  and route behavior are actually exercised.
- **Get code:** read-only `pre` using `overflow-x-auto rounded-lg bg-background p-4 font-mono
  text-xs`; `Copy code` button; helper `Paste this iframe into an HTML or CMS code block.`;
  unsaved state message `Save this embed to generate permanent code.`.
- **Clipboard failure:** retain selectable code and show `Copy was blocked. Select the code and
  copy it manually.` below the button.
- **Loading:** preview-area skeletons matching cards/rows, not a spinner.
- **Error:** `Preview could not be loaded.` with Retry.

### Tasks

- [ ] T022: Add lazy editor routes to `src/App.tsx` and add exact route/title rows to
  `docs/DESIGN-SYSTEM.md`.
- [ ] T023: Build `EmbedEditorPage` with every control, validation, dirty-state, save, and recovery
  behavior above using existing components only.
- [ ] T024: Build `EmbedPreviewPanel` and wire every draft change to an immediate preview re-render.
- [ ] T025: Add component-level tests for section visibility, required-field locking, validation,
  dirty state, clipboard success/failure, and saved-code gating.

## Phase 7: Frontend UI — Public Embed Renderer

### UI Spec: `PublicEmbedPage`

- **File:** replace `src/pages/public/EmbedPage.tsx` with a route-based shell for
  `/embed/:embedId`; keep the old event-slug route in a separate legacy wrapper until migration.
- **Props:** none; reads `embedId`, calls `publicEmbeds.getPublic(embedId)`, and passes the result to
  `EmbedRenderer`.
- **Layout:** no `PublicLayout` brand header or admin shell. Root is
  `min-h-screen bg-background p-3 text-foreground sm:p-4`, deliberately compact for iframe use.
- **Agenda:** day headings, time/room grid, track accent using configured primary color, clickable
  session details only when optional detail fields are enabled.
- **Schedule itinerary:** search input; track filter when multiple tracks are present; chronological
  session cards with configured session/speaker fields.
- **Session list:** search input and single-column cards/rows showing configured session fields.
- **Speaker gallery:** search input and `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` cards;
  clicking a card expands safe configured speaker details inline.
- **Speaker list:** alphabetical single-column rows with configured speaker fields and linked
  published sessions when enabled.
- **Empty:** exact view-aware messages: `The agenda has not been published yet.`, `No published
  sessions match this embed.`, or `No public speakers match this embed.`.
- **Unavailable:** for missing/disabled/unpublished records show `This embed is unavailable.` and
  no event metadata.
- **Loading:** skeleton shape matching chosen view when known; otherwise four neutral rows.
- **Error:** `This embed could not be loaded. Refresh to try again.`.
- **Footer:** `Powered by Takumi Talks` as muted text; no external branding asset dependency.

### UI Spec: `EmbedRenderer`

- **File:** `src/components/embeds/EmbedRenderer.tsx`
- **Props:** `{ embed: PublicEmbedView }`.
- **State:** `query: string`, `selectedTrackId: string | "all"`, `expandedItemKey: string | null`.
- **Behavior:** search and track changes filter the already-loaded safe projection; no refetch per
  interaction. Reset expanded item if filters remove it. All interactive elements have visible
  focus states from the existing token system.

### Tasks

- [ ] T026: Refactor the current agenda/speaker markup into `EmbedRenderer`; add all five views and
  honor saved theme, primary color, filters, date/time formats, and field options.
- [ ] T027: Add lazy `/embed/:embedId` route while retaining legacy `/e/:eventSlug/:feed` behavior.
- [ ] T028: Add Cloudflare Worker header configuration proving `/embed/*` is frameable; do not relax framing
  policy for organizer or speaker-portal routes.
- [ ] T029: Browser-check each view at 375px and desktop width, including keyboard search/filter,
  inline expansion, empty, unavailable, loading, and error states.

## Phase 8: Security, Tests, and Verification

- [ ] T030: Extend `src/test/public-embed.test.ts` for URL and snippet generation, field-map
  defaults, color validation, view labels, HTML attribute escaping, and opaque embed IDs.
- [ ] T031: Add Convex tests proving: only published events; only enabled embeds; only published
  agenda items; only accepted speakers; selected-track filtering; optional-field omission; no IDs,
  emails, answers, statuses, or internal storage keys in the serialized public response.
- [ ] T032: Add organizer CRUD tests for event isolation, track ownership, validation, disabled
  duplicate defaults, and deletion.
- [ ] T033: Extend `src/test/data-adapter.contract.test.ts` only for the Convex-supported contract;
  explicitly assert the Airtable adapter fails closed rather than pretending parity.
- [ ] T034: Run `npm run typecheck`, `npm run test`, `npm run build`, `npm run lint`,
  `git diff --check`, and the repository's secret scan.
- [ ] T035: Drive every step in `USER_JOURNEY.md` in the browser from sidebar entry through code
  copied into a blank external HTML fixture. Capture desktop and 375px evidence.
- [ ] T036: Verify a published agenda change and accepted-speaker profile change appear on the next
  iframe load without regenerating code.
- [ ] T037: Update `docs/features/INDEX.md` to `done` only after the full browser journey and public
  data-leak tests pass. Keep deployment proof distinct from local checks.

## Task Dependencies

- T001–T003 precede implementation so the restored scope is canonical.
- T004–T014 precede saved admin UI and permanent code generation.
- T015–T017 precede list/editor copy actions and public route wiring.
- T018–T025 may proceed after repository CRUD exists.
- T026–T029 require the safe public projection and saved configuration.
- T030–T037 gate completion and must not be replaced by typecheck/build alone.

## Verification Checklist

- [ ] All acceptance criteria in `requirements.md` are met.
- [ ] Organizer reaches CMS > Embeds from the sidebar without typing a route.
- [ ] Create, edit, save, preview, copy, enable/disable, duplicate, and delete work visibly.
- [ ] Configuration and state persist after refresh and a new browser session.
- [ ] All five view types render and honor supported filters/fields.
- [ ] Generated iframe works in a blank external HTML page at desktop and 375px.
- [ ] Public projection and route expose no private records or fields.
- [ ] Disabled/deleted embeds and unpublished events reveal no event metadata.
- [ ] Public data updates on the next load without code regeneration.
- [ ] Empty, loading, validation, API failure, clipboard failure, and unavailable states are proven.
- [ ] Public route remains lazy-loaded and intentionally frameable without making admin routes
  frameable.
- [ ] No regression to the four legacy `/e/:eventSlug/:feed` links delivered by PR #63.
- [ ] Docs and `docs/features/INDEX.md` are updated in the same implementation commit.
