# Speaker-Portal Resource / Wiki Pages — Design

**Last Updated:** 2026-08-17
**Status:** Planned — not implemented
**Blocked on:** decision D-3 (the embed host allowlist) in `kill-my-saas-brief/plan.md`

## What exists to reuse, and what does not

| Candidate | Verdict |
|---|---|
| `src/components/editor/RichTextEditor.tsx` (TipTap StarterKit + Link, inline link row rather than `window.prompt`) | **Reuse as-is.** Its comment notes that a native prompt "hangs any automated walkthrough" — which matters directly for the browser-verification gate |
| `src/components/shared/RichText.tsx` (`DOMPurify.sanitize` + prose classes) | **Reuse the pattern, not the component.** It uses DOMPurify's default profile, which strips iframes. Resource pages need a wider, explicit profile, so they get their own render component built the same way |
| `src/lib/rich-text.ts` (`normalizeRichTextContent`, markdown → HTML fallback) | **Reuse.** Lets an organizer paste markdown and get sane HTML |
| `src/lib/strip-html.ts` | **Reuse** for generating list-view excerpts. Its multi-pass loop exists because a single-pass tag strip can re-form `<script` out of `<scr<script>ipt>` — that reasoning applies here too |
| `src/pages/settings/Library.tsx` | **Not a reuse path.** It is a tag manager, despite the name |
| `portal_form` machinery (`convex/forms.ts`, `portalFormResponses.ts`) | **Not a reuse path.** Forms collect input; resource pages publish content. Sharing a model would distort both |
| `embeds` table / `EmbedRenderer` | **Not a reuse path.** Those are public, published-program projections with a `frame-ancestors *` CSP. Resource pages are authenticated portal content with the opposite threat model |

## Schema

```ts
// Organizer-authored reference content for the speaker portal. Deliberately NOT public: this is
// authenticated portal content, unlike `embeds`, and no public query, attendee-site projection, or
// API scope reaches it. eventId is the tenant boundary, inherited through `events`.
portal_resource_pages: defineTable({
  eventId: v.id("events"),
  title: v.string(),
  // URL segment, unique per event, lowercase-kebab. Stored rather than derived so retitling a
  // published page does not break links speakers have already bookmarked.
  slug: v.string(),
  // Already sanitized. Write-time sanitization is what makes this field safe to trust; read-time
  // sanitization then covers rows written under an older policy.
  bodyHtml: v.string(),
  // Short plain-text line for the list view. Derived from bodyHtml with stripHtmlTags on save.
  excerpt: v.optional(v.string()),
  sortOrder: v.number(),
  status: v.union(v.literal("draft"), v.literal("published")),
  publishedAt: v.optional(v.number()),
  createdByUserId: v.string(),
  updatedByUserId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_event", ["eventId"])
  .index("by_event_status", ["eventId", "status"])
  .index("by_event_slug", ["eventId", "slug"]),
```

`by_event_status` is what the portal query uses, so a speaker's read never scans drafts at all.

## The sanitizer — `src/lib/sanitize-portal-html.ts` (new, shared)

One module, imported by both the Convex mutation and the React renderer. It must be free of
browser-only globals at import time so the Convex runtime can use it; DOMPurify runs in Convex's
Node action/mutation environment via a JSDOM-less path or, if that proves impossible in this Convex
version, the server uses a strict parser-based allowlist and the client uses DOMPurify with the
identical configuration object. **Resolve which of these two applies before starting T2** — it is
the one implementation unknown in this package.

```ts
export const PORTAL_HTML_ALLOWED_TAGS = [
  "p","br","strong","em","u","s","code","pre","blockquote",
  "h2","h3","h4","ul","ol","li","a","hr","table","thead","tbody","tr","th","td",
  "img","iframe",
];

export const PORTAL_HTML_ALLOWED_ATTR = [
  "href","title","target","rel",
  "src","alt","width","height",
  "allow","allowfullscreen","loading","referrerpolicy","sandbox",
];

// Decision D-3. Fixed in code — not user-configurable and not an environment variable, because a
// configurable host list is an organizer-editable XSS control surface.
export const PORTAL_EMBED_ALLOWED_HOSTS = [
  "www.youtube-nocookie.com",
  "www.youtube.com",
  "player.vimeo.com",
  "docs.google.com",
  "www.loom.com",
];

export function sanitizePortalHtml(input: string): { html: string; removed: string[] };
```

Rules the implementation enforces:

1. `FORBID_TAGS`: `script`, `style`, `object`, `embed`, `form`, `input`, `button`, `link`, `meta`,
   `base`, `svg`, `math`.
2. `FORBID_ATTR`: every `on*` handler, `srcdoc`, `formaction`, `xlink:href`, `style`.
3. `<a href>` limited to `http:`, `https:`, `mailto:`; anything else (notably `javascript:` and
   `data:`) dropped. Every surviving link gets `rel="noopener noreferrer nofollow"` and
   `target="_blank"`.
4. `<img src>` limited to `https:`. No `data:` URIs — an inline base64 image is an easy way to blow
   past the size cap and a common obfuscation vector.
5. `<iframe src>` must parse as `https:` **and** its host must be in
   `PORTAL_EMBED_ALLOWED_HOSTS` by exact match — never `endsWith`, which `evil-youtube.com` defeats.
   Surviving iframes are forced to
   `sandbox="allow-scripts allow-same-origin allow-presentation"`, `loading="lazy"`,
   `referrerpolicy="no-referrer"`, and a `title` derived from the host.
6. `removed[]` collects human-readable descriptions ("removed a `<script>` block", "removed an
   iframe from `evil.example`") for FR-007.
7. Output length is capped at 100 KB **after** sanitization; over that, the mutation rejects rather
   than truncating mid-tag.

`allow-scripts` plus `allow-same-origin` together are normally a sandbox escape — but only when the
framed origin is the *same* origin as the parent. Here every permitted host is third-party, so the
combination is what makes YouTube and Vimeo players work without granting them access to the portal
origin. This reasoning belongs in a code comment; it is the kind of thing a future reader will
otherwise "fix".

## Convex functions — `convex/portalResourcePages.ts` (new)

```ts
// Organizer authoring surface. Drafts included.
export const listAdmin = query({
  args: { eventId: v.id("events") },
  // assertEventOrganizerAccess
});

export const getAdmin = query({
  args: { eventId: v.id("events"), pageId: v.id("portal_resource_pages") },
  // assertEventOrganizerAccess + row.eventId === args.eventId
});

export const save = mutation({
  args: {
    id: v.optional(v.id("portal_resource_pages")),
    eventId: v.id("events"),
    title: v.string(),
    slug: v.optional(v.string()),      // derived from title when absent; uniqueness enforced per event
    bodyHtml: v.string(),
    sortOrder: v.optional(v.number()),
    status: v.union(v.literal("draft"), v.literal("published")),
  },
  // assertEventOrganizerAccess
  // 1. title trimmed, 1..160 chars
  // 2. slug normalized; collision → append -2, -3 …; never silently overwrite another page
  // 3. const { html, removed } = sanitizePortalHtml(normalizeRichTextContent(bodyHtml))
  // 4. reject when html.length > 100_000
  // 5. excerpt = stripHtmlTags(html).slice(0, 200)
  // 6. publishedAt set on the draft→published transition only; retained on unpublish
  // returns { id, removed }   ← the UI shows `removed` to the author (FR-007)
});

export const remove = mutation({
  args: { eventId: v.id("events"), pageId: v.id("portal_resource_pages") },
  // assertEventOrganizerAccess. Hard delete — there is no revision history in v1, and a
  // soft-delete state that nothing surfaces is worse than an honest delete.
});

export const reorder = mutation({
  args: { eventId: v.id("events"), orderedIds: v.array(v.id("portal_resource_pages")) },
  // assertEventOrganizerAccess
});

// Speaker-facing. Published only, own event only.
export const listForSpeaker = query({
  args: { eventId: v.id("events"), speakerId: v.id("speakers") },
  // assertOrganizerOrOwnsSpeaker(ctx, eventId, speakerId)  — convex/speakers.ts:216
  // withIndex("by_event_status", q => q.eq("eventId", eventId).eq("status", "published"))
  // returns { id, title, slug, excerpt, sortOrder }  — no bodyHtml in the list
});

export const getForSpeaker = query({
  args: { eventId: v.id("events"), speakerId: v.id("speakers"), slug: v.string() },
  // same guard; rejects a draft with the same not-found error a missing page produces, so the
  // existence of a draft is not discoverable by slug probing
});
```

The organizer branch inside `assertOrganizerOrOwnsSpeaker` is what lets an organizer preview the
portal exactly as a speaker sees it, without a second code path.

## Routes

| Route | Component | Access |
|---|---|---|
| `/portal/resources` | `src/pages/portal/PortalResources.tsx` (new) | Portal identity |
| `/portal/resources/:slug` | same module, detail view | Portal identity |
| `/events/:eventSlug/portals/resources` | `src/pages/program/PortalResourcesAdmin.tsx` (new) | `RequireOnboarding` + organizer |
| `/events/:eventSlug/portals/resources/:id/edit` | editor | as above |

Registered in `src/App.tsx` beside the existing `portals/forms` and `portals/tasks` routes
(`App.tsx:440-441`). Portal nav gains a `Resources` item in `PortalLayout.tsx:9-21` and a
`portalTitle` case.

## UI states

**Portal — Resources list**

| State | Render |
|---|---|
| Loading | `SkeletonList` — the existing portal loading component |
| No published pages | `EmptyState`: "No resources yet — your organizer will add event information here." Not an error |
| Has pages | Title + excerpt rows in `sortOrder`, keyboard navigable |
| Error | Inline `role="alert"`; nav still works |
| No speaker identity | Existing `PortalAccessRequired` |

**Portal — Resource detail**

| State | Render |
|---|---|
| Loading | Skeleton |
| Found | Sanitized body via the new render component; embeds sandboxed and lazy |
| Not found / draft / other event | "This page isn't available" — identical copy for all three, so drafts are not discoverable |
| Embed blocked by the speaker's browser | The iframe's own fallback; the rest of the page still renders |

**Organizer — admin list and editor**

| State | Render |
|---|---|
| Empty | "No resource pages yet" with a create action |
| Editor | `RichTextEditor`, title, slug (auto-derived, editable), sort order, `Draft`/`Published` |
| Saved with removals | Success plus an explicit list: "Saved. Removed: a `<script>` block, an iframe from evil.example" |
| Save rejected (too large) | Inline error naming the limit; content is not truncated |
| Slug collision | Slug shown as adjusted, not silently changed |
| Preview | Renders through the same component the portal uses — never a separate preview renderer |

No new card surface, no border, no divider, no fixed overlay. The editor is a normal page, matching
`CommTemplateEditor` and `SubmissionFormBuilder`.

## Seed

Two published pages and one draft, idempotent by title:

1. **"Venue and travel"** — headings, a list, a link, and one allowlisted embed (a map or a video).
2. **"AV and slide requirements"** — headings, a table, deadlines that align with the seeded
   onboarding tasks.
3. **"Post-event recording policy" (draft)** — proves that drafts exist and that speakers cannot
   see them.

Seeded bodies are run through `sanitizePortalHtml` in the seed itself, so seeded content cannot
diverge from the policy.

## Risks

| Risk | Mitigation |
|---|---|
| DOMPurify unavailable in the Convex runtime | Resolve before T2; fall back to a parser-based server allowlist sharing the same configuration object. Do **not** ship write-time-only or read-time-only sanitization |
| Host allowlist bypassed via subdomain matching | Exact host match only; never `endsWith` or `includes` |
| An organizer pastes tracking or phishing markup | Sanitizer strips scripts and handlers; links are `nofollow noopener`; organizer access is already an authenticated, invited role |
| A tightened policy leaves old rows dangerous | Read-time sanitization applies the current policy on every render |
| Resource content leaks publicly | No public query, embed view, attendee-site projection, or `api_tokens` scope references the table; asserted by a contract test |
| Page becomes a DoS payload | 100 KB post-sanitization cap; `data:` images forbidden |
</content>
