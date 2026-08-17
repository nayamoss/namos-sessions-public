# App Shell Consistency — Technical Design

## Database / Schema Changes

N/A — pure frontend component/markup refactor, no data model touched.

---

## Backend / API

N/A — no endpoints touched.

---

## Frontend Components

### Modified Components

| File Path | Change |
|-----------|--------|
| `src/components/ui/sidebar.tsx` | **Delete.** Re-confirm zero imports (`grep -rl "components/ui/sidebar" src/`) immediately before deleting, in case something changed since the audit. |
| `src/pages/events/EventsLanding.tsx` | Replace the inline `<div className="flex gap-1 rounded-md bg-muted p-1">` + mapped `<button>` filter toggle (around the `ContentToolbar`'s `utilities` slot) with `<SegmentedControl label="Event status" value={filter} options={[{value:"all",label:"All"},{value:"draft",label:"Draft"},{value:"published",label:"Published"},{value:"archived",label:"Archived"}]} onChange={setFilter} />`. Also rewrite `EventEditor` (defined in this same file) to render inside `DetailPane` — see below. |
| `src/pages/settings/EventTeam.tsx` | Rewrite `InviteEventMember` to render inside `DetailPane` instead of its own `<h2>` header. |
| `src/pages/settings/OrganizationSettings.tsx` | Rewrite `InviteOrganizer` to render inside `DetailPane` instead of its own `<h2>` header. |
| `src/test/component-canon.test.ts` | Add a new `it()` block enforcing FR-004 (raw `<button>` guard). |

### New Components

None. This pass reuses `SegmentedControl` and `DetailPane`, both of which already exist; no new
primitive is created.

### `DetailPane` migration pattern (apply to all 3 components)

`DetailPane`'s signature: `{ title: string; children: ReactNode; onClose?: () => void }`. Each of
the 3 components currently:
```tsx
function InviteOrganizer({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  ...
  return <div className="space-y-5">
    <div><h2 className="text-base font-semibold">Invite organization member</h2><p className="mt-1 text-sm text-muted-foreground">...</p></div>
    {error && <p role="alert" ...>{error}</p>}
    ...fields...
    <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={...}>Invite</Button></div>
  </div>;
}
```
becomes:
```tsx
function InviteOrganizer({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  ...
  return <DetailPane title="Invite organization member" onClose={onClose}>
    <p className="text-sm text-muted-foreground">Organization roles can access every event. Use an event team for narrower access.</p>
    {error && <p role="alert" ...>{error}</p>}
    ...fields...
    <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={...}>Invite</Button></div>
  </DetailPane>;
}
```
Keep the inline Cancel button — it's a legitimate secondary action, not a duplicate of the new
close-X. `DetailPane`'s own `onClose` prop is already optional and falls back to a URL
`?selected=` param clear when omitted; all 3 target components already receive an explicit
`onClose` from their parent page, so pass it straight through.

---

## State / Data Flow

N/A — no state, props, or data flow changes beyond what's needed to satisfy `DetailPane`'s
`title`/`onClose` props, which each component already has access to (`onClose` is an existing
prop; `title` is a string literal already present as `<h2>` text).

---

## Auth / Permissions

N/A — no access-control surface touched.

---

## Edge Cases & Error States

- Each of the 3 migrated components already renders its own inline error text
  (`role="alert"` paragraphs) — that stays unchanged inside `DetailPane`'s `children`.
- `EventsLanding`'s filter toggle: confirm the `all`/`draft`/`published`/`archived` values and
  their default (`all`) are preserved exactly — `SegmentedControl` requires `value`/`onChange`
  matching the existing `filter`/`setFilter` state, so this should be a drop-in swap with no
  logic change.
- New canon test: false positives are the main risk. Before enforcing, run the test against the
  current tree and manually classify every reported file (see the table below for a first pass)
  — don't let the test's own PR fail because the allowlist is incomplete.

### First-pass classification of files using raw `<button>` outside `components/ui/`

Built from `grep -rl "<button" src/ --include='*.tsx' | grep -v "components/ui/"` (32 files incl.
2 test files, current as of this plan). The implementing agent MUST verify each classification
by reading the actual usage — this table is a starting point, not a final allowlist:

**Likely legitimate (structural component / shell chrome / icon-only trigger) — probable allowlist:**
`components/AppLayout.tsx` (sidebar collapse, command palette, mobile menu triggers),
`components/AccountMenu.tsx`, `components/EventSwitcher.tsx`, `components/OrgMenu.tsx`,
`components/NotificationBell.tsx`, `components/ThemeMenuItems.tsx` (menu/popover triggers),
`components/shared/SegmentedControl.tsx` (the primitive's own internal button — this is the
component other files should import instead of hand-rolling),
`components/shared/DetailPane.tsx` (its own close-X button),
`components/shared/DataGrid.tsx` (sortable column headers),
`components/shared/WizardShell.tsx`, `components/shared/ChoiceCardGroup.tsx` (interactive card
buttons — intentional per the prior Card pass), `components/shared/StatusTabs.tsx`,
`components/shared/AddFieldPopover.tsx`, `components/editor/RichTextEditor.tsx` (toolbar
buttons), `components/embeds/EmbedRenderer.tsx`, `components/forms/TemplateGallery.tsx`,
`components/settings/IntegrationCard.tsx`, `components/shared/EmailIntegrationForm.tsx`
(`ProviderPicker`'s radio-style buttons — intentional, has `role="radio"`),
`components/availability/AvailabilityEditor.tsx`.

**Needs individual review — may be legitimate or may be more drift like `EventsLanding`'s toggle:**
`pages/cms/EmbedsListPage.tsx`, `pages/dashboard/DashboardHome.tsx`,
`pages/onboarding/steps/ImportDataStep.tsx`, `pages/portal/PortalForms.tsx`,
`pages/portal/PortalPages.tsx`, `pages/program/Agenda.tsx`, `pages/program/Evaluation.tsx`,
`pages/program/ScorecardForm.tsx`, `pages/program/Sponsors.tsx`,
`pages/program/SubmissionFormBuilder.tsx`, `pages/settings/ApiKeys.tsx`.

**Fixed by this plan, must NOT be allowlisted once fixed:**
`pages/events/EventsLanding.tsx` (FR-002 target), `pages/settings/EventTeam.tsx` (only the
`InviteEventMember` header changes — if it has other legitimate raw buttons elsewhere in the
file, those may still need allowlisting after the `DetailPane` migration).

**Test files** (`test/app-layout.test.tsx`, `test/content-toolbar.test.tsx`): exclude test files
from the scan entirely, matching how `component-canon.test.ts`'s `sourceFiles()` walker already
skips the `test/` directory.

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Delete vs. deprecate `sidebar.tsx` | Delete outright | Zero imports means zero risk; keeping it "just in case" is exactly the trap the audit flagged. |
| `DetailPane` migration scope | Only the 3 components identified, not a broader sweep | These are the only 3 confirmed cases of the record-detail-panel pattern bypassing `DetailPane`; other `<aside>` usages (`Availability.tsx`, `ApiDocs.tsx`, `CommTemplateEditor.tsx`) are a different layout pattern (in-page columns, not record details) and correctly don't use it. |
| Button canon test allowlist | Built via file-by-file classification, not a blanket exemption for `pages/` or `components/shared/` | A blanket exemption would defeat the test's purpose — the whole point is catching a future `EventsLanding`-style mistake in exactly those directories. |
| Enforcement test placement | Extend existing `component-canon.test.ts` rather than a new file | Matches the codebase's established pattern — one canon file already guards 3 categories of drift; this is a 4th. |

## Dependencies

**Requires:** none — can start immediately, independent of any other in-flight work.
**Enables:** the button-canon test guard also protects the `SegmentedControl`/`DetailPane` fixes
themselves from regressing back to hand-rolled markup later.

## Risks & Mitigations

- **Risk:** the "needs individual review" file list in the classification table turns out to
  contain more `EventsLanding`-style drift than expected, expanding scope mid-implementation.
  **Mitigation:** this plan's Phase 2 explicitly asks the implementer to classify, not silently
  allowlist-and-move-on; if a file in that list turns out to be a genuine duplicate of an
  existing shared component, log it in the plan's Task Dependencies / follow-up notes rather than
  silently fixing it (scope creep) or silently allowlisting it (defeats the guard) — flag it for
  a follow-up decision.
- **Risk:** `DetailPane`'s default `onClose` behavior (URL `?selected=` param clear) doesn't
  match what these 3 components need if their parent doesn't use `?selected=` routing.
  **Mitigation:** all 3 already receive an explicit `onClose` prop from their parent — pass it
  through explicitly rather than relying on `DetailPane`'s fallback, sidestepping this entirely.
- **Risk:** removing `sidebar.tsx` breaks a build step that globs `components/ui/*` blindly
  (e.g. a barrel export).
  **Mitigation:** grep for any `export *` or index barrel referencing `components/ui/sidebar`
  before deleting, not just direct imports.
