# Speaker-Portal Resource / Wiki Pages — Plan

**Status:** Planned — DO NOT IMPLEMENT YET
**Phase in `kill-my-saas-brief/plan.md`:** 4
**Blocked on:** decision D-3 (embed host allowlist)
**Unknown to resolve before T2:** whether DOMPurify runs in the Convex mutation runtime in this
project's pinned versions (`convex@^1.42.3`, `dompurify@3.4.13`). If it does not, the server needs a
parser-based allowlist sharing the same configuration object. This changes T2's implementation but
not its contract.

## Task breakdown

### T1 — Schema

**Files:** `convex/schema.ts`

`portal_resource_pages` with three indexes per `design.md`. New table; no migration.

### T2 — Shared sanitizer

**Files:** `src/lib/sanitize-portal-html.ts` (new)

Export `PORTAL_HTML_ALLOWED_TAGS`, `PORTAL_HTML_ALLOWED_ATTR`, `PORTAL_EMBED_ALLOWED_HOSTS`, and
`sanitizePortalHtml(input) → { html, removed }`.

Implementation notes for whoever picks this up:

- No browser-only globals at module scope — the Convex mutation imports this file.
- Host checking: `new URL(src).host` compared by **exact string equality** against the allowlist.
  Wrap in try/catch; an unparseable URL means drop the element.
- Forced iframe attributes are set after sanitization, never trusted from the input.
- `removed[]` is human-readable, not a machine code. The author reads it.
- Unit tests for this module come before any UI work. It is the security boundary.

### T3 — Convex module

**Files:** `convex/portalResourcePages.ts` (new), `src/data/repo.ts`, `src/data/types.ts`

Six functions per `design.md`. Notes:

- `listForSpeaker` must not return `bodyHtml`. A list view rendering full bodies is both a
  performance and a data-exposure mistake.
- `getForSpeaker` returns the same not-found error for missing, draft, and wrong-event, so drafts
  are not discoverable by probing slugs.
- Slug collision appends a numeric suffix and reports the adjusted slug back to the caller.

### T4 — Portal UI

**Files:** `src/pages/portal/PortalResources.tsx` (new),
`src/components/shared/PortalRichContent.tsx` (new), `src/pages/portal/PortalLayout.tsx`,
`src/App.tsx`

1. `PortalRichContent` is `RichText.tsx`'s pattern with the portal profile — a separate component,
   not a prop on `RichText`, so the wider profile can never be selected by accident on the public
   CFP.
2. List and detail views; the detail view is a normal page, not a modal.
3. Portal nav item + `portalTitle` case.
4. Routes under the existing `/portal/*` element.

### T5 — Organizer admin UI

**Files:** `src/pages/program/PortalResourcesAdmin.tsx` (new), `src/App.tsx`

List with drag or move-control reordering, create/edit with `RichTextEditor`, draft/published
toggle, delete with confirmation, and a preview that renders through `PortalRichContent`.

Reordering: follow `AgendaMoveControl`'s precedent — if drag is offered, a keyboard equivalent is
mandatory.

### T6 — Seed

**Files:** `convex/seed.ts`

Two published pages and one draft, bodies passed through `sanitizePortalHtml` inside the seed.

### T7 — Docs

`docs/features/INDEX.md`, `docs/user-journeys/pages/`, `docs/DESIGN-SYSTEM.md` route table.

## Test cases

Sanitizer tests are the priority; they are the security boundary and are testable without any
Convex or React scaffolding.

| ID | Type | Input | Expected |
|---|---|---|---|
| TC-1 | unit | `<script>alert(1)</script><p>hi</p>` | `<p>hi</p>`; `removed` names the script |
| TC-2 | unit | `<img src=x onerror=alert(1)>` | `onerror` gone; element kept or dropped, never with the handler |
| TC-3 | unit | `<a href="javascript:alert(1)">x</a>` | `href` dropped; text preserved |
| TC-4 | unit | `<a href="https://ok.example">x</a>` | `rel="noopener noreferrer nofollow"`, `target="_blank"` |
| TC-5 | unit | `<iframe src="https://www.youtube-nocookie.com/embed/abc">` | Kept, with forced `sandbox`, `loading`, `referrerpolicy`, `title` |
| TC-6 | unit | `<iframe src="https://evil.example/x">` | Dropped; `removed` names the host |
| TC-7 | unit | `<iframe src="https://evil-www.youtube.com/x">` | Dropped — exact host match, not suffix match |
| TC-8 | unit | `<iframe src="http://www.youtube.com/embed/x">` | Dropped — https only |
| TC-9 | unit | `<iframe srcdoc="<script>…">` | `srcdoc` dropped |
| TC-10 | unit | `<scr<script>ipt>alert(1)</script>` | No `<script` in the output (the `strip-html.ts` re-forming case) |
| TC-11 | unit | `<img src="data:image/png;base64,…">` | Dropped |
| TC-12 | unit | `<form><input></form>` | Dropped |
| TC-13 | unit | `<p style="position:fixed;top:0">` | `style` dropped |
| TC-14 | unit | 200 KB of valid content | `save` rejects with the limit named; nothing truncated |
| TC-15 | unit | Markdown input with no tags | `normalizeRichTextContent` converts, then sanitizes |
| TC-16 | contract | `save` by a reviewer | Organizer-access error |
| TC-17 | contract | `save` with an `eventId` the caller does not organize | Rejected |
| TC-18 | contract | `listForSpeaker` by a speaker of another event | Rejected |
| TC-19 | contract | `listForSpeaker` returns drafts | Never — index is `by_event_status` on `published` |
| TC-20 | contract | `getForSpeaker` on a draft slug | Same not-found error as a missing slug |
| TC-21 | contract | `listForSpeaker` payload | Contains no `bodyHtml` |
| TC-22 | unit | Slug collision on save | Adjusted slug returned; existing page untouched |
| TC-23 | unit | draft → published | `publishedAt` set; published → draft retains it |
| TC-24 | contract | Public surfaces | No public query, embed view, attendee-site projection, or `api_tokens` scope reaches the table |
| TC-25 | component | Portal detail renders a stored row containing markup that a *tightened* policy now forbids | Removed at render time |
| TC-26 | seed | Seed twice | Two published pages, one draft, no duplicates |

## Browser verification steps

1. Organizer → Portals → Resources → create a page with a heading, list, link, table, and a
   YouTube embed. Save as draft.
2. Sign in as a seeded speaker: Resources shows nothing (or only previously published pages). The
   draft is not listed and its slug is not reachable.
3. Publish. Reload the portal: the page appears in `sortOrder`.
4. Open it as the speaker: content renders, the embed plays, links open in a new tab.
5. Back as organizer, edit the page and paste
   `<script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://evil.example"></iframe>`.
   Save. Confirm the success message enumerates all three removals.
6. **Inspect the stored row** (Convex dashboard or a query) and confirm none of the three survived
   the write. Passing this by looking at the rendered page only is not sufficient.
7. Reorder two pages; confirm the portal order matches, using the keyboard path as well as drag.
8. Unpublish; confirm the page vanishes from the portal and its content is retained in the admin.
9. Delete; confirm the confirmation step and that the portal updates.
10. Sign out and request `/portal/resources` and a known slug directly: both rejected.
11. As an organizer of a different event, request the same page: rejected.
12. At a 390px viewport: list and detail readable, embed responsive, no horizontal scroll.
13. Keyboard-only pass of the list and detail views.

## Rollback

New table, new module, new routes, one nav item. Removing the route and the nav item hides the
feature entirely; the table can be left in place harmlessly. Nothing existing is modified except
`PortalLayout.tsx`'s nav array and `App.tsx`'s route list.
</content>
