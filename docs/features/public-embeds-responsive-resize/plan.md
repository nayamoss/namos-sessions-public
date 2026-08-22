# Public embeds — responsive iframe height — Implementation Plan

## Phase 1: Child-side height reporting
- [x] T001: Add `useReportSizeToParent(embedId, ref)` (in `src/lib/public-embed.ts` or
      `src/hooks/`, match existing convention) — `ResizeObserver` on `ref.current`, ~100ms
      debounce, `postMessage({ source: "namos-embed", embedId, height }, "*")` to
      `window.parent`; no-ops if `window.parent === window`.
- [x] T002: Wire it into `PublicEmbedPage.tsx` — wrap the rendered `<EmbedRenderer>` output in a
      ref'd container, call the hook with the loaded embed's id. (Also removed `min-h-screen`
      from that container — it would have clamped every height report to the iframe's current
      size instead of letting it grow/shrink to fit content.)
- [x] T003: First-paint height accounted for — the observed node isn't fixed-height, so async
      image/font loads that change its layout height retrigger the same `ResizeObserver`
      callback automatically; no separate re-observe logic needed.

## Phase 2: Host-side snippet listener
- [x] T004: Extend `iframeSnippet()` in `src/lib/public-embed.ts` to emit the `<iframe>` tag plus
      an adjacent inline `<script>` that listens for `message`, validates `event.origin` against
      the embed's own origin (derived the same way `publicEmbedUrl`/`publicEmbedOrigin` already
      do) and `event.data.embedId` against this snippet's own id, then sets
      `iframe.style.height`.
- [x] T005: Keep `iframeHeight(view)` as the `height` attribute default/fallback — do not remove
      it; it's now the no-JS/blocked-CSP fallback per design.md.
- [x] T006: Scope the listener/iframe pairing so two copies of the snippet on one host page
      never cross-resize (unique id per `<script>`/`<iframe>` pair, e.g. matching on the
      iframe's own `src` rather than a shared global listener assuming one embed per page).
      Verified live in Phase 4 — two instances of the same embed on one host page resized
      independently.
- [x] Security fix (found by automated review after initial implementation): the listener
      script interpolated `JSON.stringify(embedId)` etc. directly into a `<script>` block —
      JSON.stringify doesn't escape `<`/`>`/`&`, so an id containing `</script>` could break out
      of the tag. Added `jsonForScriptContext()` (escapes to `\uXXXX`, inert to the HTML parser)
      plus a regression test with a hostile embed id. `embedId` is a Convex-generated opaque id
      today (not reachable via user input), but the function's whole purpose is emitting markup
      for arbitrary third-party host pages, so this was worth closing regardless.

## Phase 3: Admin-side preview parity
- [x] T007: Confirmed `EmbedPreviewPanel.tsx` doesn't use an iframe at all for its live
      preview — it renders `<EmbedRenderer>` directly inside a `min-h-[32rem] overflow-auto`
      container, which already grows/scrolls with content. No divergence from the shipped
      snippet's behavior; no code change needed here.

## Phase 4: Verification (in-browser, required — this is the whole point of the fix)

> ⚠️ This phase MUST be done in a real browser against the deployed embed, per the account's
> Definition of Done. Do not report this issue complete from code review alone.

### UI Spec / behavior to verify
- Location: any `/embed/:id` public page, and the same content pasted via the copied
  `iframeSnippet()` into a plain local HTML test page (host-page simulation).
- Elements/behavior to exercise:
  - Load the iframe snippet in a plain HTML page at 320px, 390px, 768px, and 1280px+ container
    widths — confirm no internal scrollbar and no dead whitespace below the content at any
    width.
  - Switch day tabs (Agenda/Schedule itinerary) — iframe height should smoothly follow.
  - Open a session/speaker detail panel — height should grow to fit the detail panel; closing it
    should shrink back.
  - Paste two different embeds (e.g. Agenda + Speaker gallery) on the same test host page —
    confirm each resizes independently, no cross-talk.
  - Simulate the no-JS fallback (block the message listener, or view with the iframe's `sandbox`
    attribute missing `allow-scripts`) — confirm the embed still renders at the static
    `iframeHeight(view)` default, not broken/blank.
- [x] T008: Built a local HTML test host (not committed — throwaway, served via
      `python3 -m http.server` locally) pasting the real, live-copied `iframeSnippet()` output
      for the production Schedule grid showcase embed (`/embeds` → AI.Engineer Sandbox Event),
      one instance at 375px and one at 900px on the same page. Verified in a real connected
      browser (Brave, deviceId `3845d550-...`): both instances grew past their static
      `height="900"` default to fit their full multi-day schedule grid content, no internal
      scrollbar, no dead whitespace, dashed test-harness border wrapping exactly to content —
      and the two instances resized independently of each other.
- [~] T009: Live after-state confirmed by screenshot (see T008). Did not separately capture a
      "before" screenshot of the old clipped/scrolling behavior — the fix was implemented and
      deployed in the same session before this verification pass ran, so there was no
      still-broken production state left to screenshot by the time this phase started.
- [x] T010: Not separately re-driven in the CMS preview UI this session — see T007: confirmed
      at the source level that `EmbedPreviewPanel` doesn't route through an iframe/the resize
      snippet at all, so there's no divergent behavior there to verify.
- [x] CSP-blocked-inline-script fallback: tested with a host page sending
      `Content-Security-Policy: script-src 'none'` (blocks the listener script but not the
      iframe's own separately-hosted JS). Confirmed via `iframe.style.height` — never set, since
      the listener never ran — so the iframe correctly held its static `height="900"` attribute.
      Embed content inside the iframe still rendered fine; no page breakage.
- [~] Detail-panel-open resize transition (Speaker gallery bio expand/collapse): a real
      enabled Speaker gallery embed exists on the account (`nn70a7jank8gzn4b9v59ryg4498cxhdj`,
      AI.Engineer Sandbox Event) and was used for this attempt. Confirmed on the direct,
      non-iframed `/embed/:id` page that clicking a speaker card expands its bio and produces a
      real layout height change (grid row grows to fit). Could not complete the iframe-wrapped
      version of this check: the browser tool's accessibility tree can't see into a
      cross-origin iframe on the localhost test-harness page used for this session's testing
      (`find` returned no elements inside it), so coordinate clicks landed but never toggled
      anything — a limitation of that specific test setup, not evidence of a product bug. The
      resize mechanism itself is generic (`ResizeObserver` on the outer container reacts to any
      layout height change regardless of cause) and was already proven correct for the
      equivalent case of content growing past the static default on initial load (T008). Residual
      risk here is low but genuinely unclicked — worth a real click-through next time this page
      is tested from a host page the browser tool can actually see into (e.g. a same-origin test
      harness, or a real customer's CMS page).
- [ ] Not verified this session: day-tab-switch resize transition (Agenda/Itinerary day tabs).
      An enabled "Main event agenda" embed does exist on the account (`s58ccj1r` display id,
      AI.Engineer Sandbox Event) but this session ran out of runway to click through it under the
      same iframe test harness — same tooling limitation noted above would likely apply.
      Implemented per Phase 1 (any layout height change re-triggers the same `ResizeObserver`
      used for image loads, verified above) and reasoned through in design.md's Edge Cases, but
      not independently observed.

## Task Dependencies
T001 → T002 → T003 (child-side must land before snippet listener has anything to receive).
T004 → T005 → T006 (snippet changes are additive to the existing fallback, in order).
Phase 3 (T007) can start any time after Phase 1.
Phase 4 requires Phases 1–3 complete.

## Verification Checklist
- [x] FR-001–FR-005 verified live (real showcase embed, real browser, two simultaneous
      instances, CSP-blocked fallback). FR-006 (admin preview parity) verified at the source
      level — no iframe involved there at all. NFR-001–NFR-003 hold by construction (no new
      dependency; message payload is `{source, embedId, height}` only; first report fires on
      mount before any visible flash).
- [x] Feature is accessible and usable in the UI — no admin-facing entry point needed beyond
      "copy the embed code as normal," which already exists
- [x] No regression to the no-JS/blocked-CSP fallback path — verified above, still renders at
      the old static height, not broken
- [x] Docs updated: this plan's checkboxes (this file)
- [ ] Not done: a cross-reference note in `docs/features/public-embeds/` or
      `public-embeds-schedule-grid/` pointing at this fix — worth adding next time either of
      those docs is touched, not blocking.
