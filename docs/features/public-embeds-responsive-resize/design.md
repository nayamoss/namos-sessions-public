# Public embeds — responsive iframe height — Technical Design

## Database / Schema Changes
N/A — no schema change. Auto-resize is a client-side behavior on the existing public embed
record (`PublicEmbed`/`PublicEmbedView`); no new field is needed to turn it on, and per
requirements Out of Scope there is no per-embed opt-out toggle to persist.

---

## Backend / API
### Affected Existing Endpoints
None. `repo.publicEmbeds.getPublic(embedId)` (already used by `PublicEmbedPage.tsx`) is
unchanged — this is purely a rendering/messaging behavior added around the existing data fetch.

### New Endpoints
N/A.

### Validation & Business Logic
N/A — no server-side logic changes. The one thing worth calling out as already-correct
infrastructure: `worker/security-headers.ts` builds `frame-src` from `PUBLIC_EMBED_ORIGIN` /
`VITE_PUBLIC_EMBED_ORIGIN`, which this session's separate fix (see `wrangler.jsonc`) now points
at `https://your-project.example` instead of the raw `*.workers.dev` host — the postMessage
origin check in this feature must match that same origin, not be hardcoded separately.

---

## Frontend Components
### Modified Components
| File Path | Change |
|-----------|--------|
| `src/pages/public/PublicEmbedPage.tsx` | Wrap the rendered content in a ref'd container; attach a `ResizeObserver` that debounces and `postMessage`s `{ source: "namos-embed", embedId, height }` to `window.parent` on every change (including first paint). |
| `src/lib/public-embed.ts` | `iframeSnippet()` gains an inline `<script>` block (no external src) that listens for `message`, validates `event.origin` against the embed's own origin and `event.data.embedId` against this iframe's id, and sets `iframe.style.height`. `iframeHeight(view)` stays as-is — it becomes the fallback/initial value, not the final one. |
| `src/components/embeds/EmbedPreviewPanel.tsx` | Live preview iframe (used while editing, before saving) wires up the same listener so the in-editor preview also auto-sizes — currently it likely renders at a fixed height like the shipped snippet; confirm and align during implementation. |
| `src/pages/cms/EmbedsListPage.tsx` | No behavior change — it calls the same `iframeSnippet()`, so the copy-code button picks up the new snippet automatically. |

### New Components
No new React components. One small shared helper:

**`useReportSizeToParent` (or equivalent inline hook)**
- File: `src/lib/public-embed.ts` (co-located with the other embed helpers) or
  `src/hooks/useReportSizeToParent.ts` if the codebase's convention is a dedicated hooks dir —
  match whatever `src/hooks/` already contains.
- Signature: `useReportSizeToParent(embedId: EmbedId, ref: RefObject<HTMLElement>): void`
- Behavior: creates a `ResizeObserver` on `ref.current`, debounces callbacks (~80–120ms), calls
  `window.parent.postMessage({ source: "namos-embed", embedId, height }, "*")` on change. Uses
  `"*"` as target origin deliberately — the embed is designed to be pasted into arbitrary
  third-party host pages whose origin is unknown ahead of time; the security boundary is on the
  **receiving** side (the snippet's listener script validates `event.origin` against the known
  embed origin, not the other way around). No-ops safely if `window.parent === window` (e.g.
  someone opens the embed URL directly, not inside an iframe).

---

## State / Data Flow
1. Host page (any third-party site/CMS) renders the pasted `<iframe src="https://your-project.example/embed/:id">`.
2. Child (`PublicEmbedPage.tsx`) fetches and renders the embed as today via `repo.publicEmbeds.getPublic`.
3. `useReportSizeToParent` observes the rendered root's height. On mount and on every
   `ResizeObserver` callback (debounced), it posts `{ source: "namos-embed", embedId, height }`
   to `window.parent`.
4. The inline listener script shipped inside the copied `<iframe>` snippet (sitting in the host
   page's DOM, next to the iframe tag) receives `message` events, filters to ones whose
   `event.origin` matches the embed's own origin and whose `data.source === "namos-embed"` and
   `data.embedId` matches this specific iframe's id (read off the iframe's own `src`), then sets
   `iframe.style.height = `${data.height}px``.
5. If step 4 never happens (script blocked, JS off, no `allow-scripts`), the iframe simply keeps
   the `height="760"` (or per-view) attribute it always had — today's behavior, unchanged.

---

## Auth / Permissions
N/A — public embeds have no auth today and this doesn't change that. `postMessage` here carries
no more information than what the embed already renders in plain HTML to any visitor.

---

## Edge Cases & Error States
- **Multiple embeds, one host page**: each `postMessage` carries its own `embedId`; the listener
  script matches it against the specific `<iframe>` it's paired with (via the iframe's own
  `src`), so embeds never resize each other.
- **Rapid content changes** (day-tab switch, opening/closing a session or speaker detail panel,
  track filter): `ResizeObserver` fires repeatedly during a transition — debounce (~100ms) so the
  iframe doesn't visibly stutter or flood `postMessage`.
- **Host CSP blocks inline `<script>`**: the snippet's listener never runs; iframe silently
  stays at the static fallback height — no thrown error, no broken embed, just today's behavior.
- **`allow-scripts` omitted on a sandboxed iframe**: same fallback path — the child page's
  `ResizeObserver`/`postMessage` calls simply don't run (or don't reach the parent); nothing
  breaks, embed still renders at the static height.
- **First paint before fonts/images finish loading**: observe the container, not a single
  snapshot — height reported after headshots/fonts load will correctly trigger a second resize
  rather than leaving stale clipped space.
- **Very tall content** (long bios, large speaker counts): no max-height is imposed by this
  feature — full natural height is the point, avoiding today's internal-scrollbar problem.
- **Someone opens `/embed/:id` directly, not inside an iframe**: `window.parent === window`, so
  the hook is a safe no-op — no console errors, no unnecessary `postMessage` to itself.

---

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Resize signaling mechanism | `ResizeObserver` + `postMessage`, inline in the copied snippet | Matches existing project posture (no external embed-resize npm package/CDN script); keeps the snippet self-contained and copy-pasteable into any CMS code block, same as today. |
| `postMessage` target origin from the child | `"*"` | Embed origin is fixed and known (`your-project.example`) but the **host** page's origin is arbitrary and unknowable at embed-authoring time — this is the standard, safe pattern for this exact use case (see iframe-resizer and similar libraries), because the real trust boundary is enforced by the *listener* validating `event.origin`, not by restricting the sender's target. |
| Static height fallback | Keep `iframeHeight(view)` as the initial/no-JS value, don't remove it | Zero regression risk for any host that can't run the listener script — embed degrades to exactly today's behavior instead of breaking. |
| Scoping resize messages | By `embedId`, not view type or DOM order | A host page can legitimately embed two Agenda views for different tracks, or an Agenda and a Speaker gallery together — index/type-based matching would misfire. |

## Dependencies
**Requires:** none — builds on the existing `iframeSnippet()`/`PublicEmbedPage.tsx` plumbing,
which is unchanged this session other than the separate `PUBLIC_EMBED_ORIGIN` domain fix already
shipped to `main`.
**Enables:** issue #257's mobile/device-width verification pass can now actually observe
correct iframe height behavior instead of the previously-flagged "untestable, not yet measured"
gap.

## Risks & Mitigations
- **Risk**: a malicious host page's script could spoof a `postMessage` claiming to be the
  embed, requesting an oversized/undersized height on their own page.
  **Mitigation**: this only affects how tall the *host's own iframe* renders on *their own
  page* — there is no cross-origin read of embed content or any other privilege being granted;
  worst case is a host page that already controls the iframe's styling resizes it oddly, which
  they could already do by editing the snippet's `height` attribute directly today.
- **Risk**: debounce window too long feels laggy; too short causes visible jitter during a
  detail-panel open/close transition.
  **Mitigation**: start at ~100ms, verify visually during implementation, adjust if needed.
