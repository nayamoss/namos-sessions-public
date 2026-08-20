# Speaker-Portal Resource / Wiki Pages — User Journey

**Status:** Planned. Journey C (the hostile-content path) is not optional — it is the journey that
determines whether this feature is safe to ship.

---

## Journey A — Organizer publishes a speaker handbook

**Entry point:** organizer → `/events/:eventSlug/portals/resources`.

| Step | Action | Expected |
|---|---|---|
| A1 | Open Resources admin | Empty state: "No resource pages yet" with a create action |
| A2 | Create "Venue and travel" | Editor opens with title, auto-derived slug (`venue-and-travel`), rich-text body, sort order, and a Draft/Published control defaulting to **Draft** |
| A3 | Write headings, a bulleted list, and a link | TipTap toolbar works; the link row is inline, not a native `window.prompt` |
| A4 | Paste a YouTube embed URL / iframe | Accepted |
| A5 | Save | "Saved" with no removals reported |
| A6 | Preview | Renders through the same component the portal uses — identical output, not a separate preview renderer |
| A7 | Create a second page and a third left as a draft | All three listed; drafts visibly marked |
| A8 | Reorder pages by drag, then by keyboard | Both work; order persists after reload |
| A9 | Publish the first two | `publishedAt` set; drafts unaffected |

**Success state:** two published pages, one draft, ordered deliberately.
**Failure state:** a page that publishes on creation, or a preview that renders differently from
the portal.

## Journey B — Speaker reads the resources

**Entry point:** speaker → `/portal` → `Resources` in the portal nav.

| Step | Action | Expected |
|---|---|---|
| B1 | Open Resources | Two pages listed with titles and excerpts, in the organizer's order. The draft is absent |
| B2 | Open "Venue and travel" | Sanitized content renders: headings, list, link, embed |
| B3 | Play the embed | Plays inline, sandboxed, lazily loaded |
| B4 | Click a link | Opens in a new tab with `rel="noopener noreferrer nofollow"` |
| B5 | Navigate back | List state preserved |
| B6 | Guess the draft's slug and request it directly | "This page isn't available" — the same message a genuinely missing page produces, so the draft's existence is not confirmed |
| B7 | Open on a 390px viewport | Readable; embed responsive; no horizontal scroll |
| B8 | Keyboard-only navigation | List is tab-navigable; the embed has an accessible title |

**Success state:** a speaker finds venue, AV, and deadline information without email.
**Recovery:** if a page fails to load, an inline alert appears and the rest of the portal —
navigation, tasks, files — still works.

## Journey C — Hostile content is neutralized (required)

**Entry point:** organizer → edit an existing resource page.

| Step | Action | Expected |
|---|---|---|
| C1 | Paste `<script>alert(1)</script>` | Save succeeds; the message names the removed script |
| C2 | Paste `<img src=x onerror=alert(1)>` | Handler removed |
| C3 | Paste `<a href="javascript:alert(1)">click</a>` | `href` dropped, link text preserved |
| C4 | Paste an iframe from `https://evil.example` | Dropped; the message names the host |
| C5 | Paste an iframe from `https://evil-www.youtube.com` | **Dropped** — exact host match, not a suffix match |
| C6 | Paste an iframe from `http://www.youtube.com` | Dropped — https only |
| C7 | Paste `<iframe srcdoc="<script>…">` | `srcdoc` removed |
| C8 | Paste `<form>` with an `<input>` | Dropped |
| C9 | Paste 200 KB of valid content | Save rejected with the limit named; content not truncated mid-tag |
| C10 | **Read the stored row directly** in the Convex dashboard | None of C1–C8's markup is present in `bodyHtml`. Sanitization happened on write, not only on render |
| C11 | Open the page as a speaker with a JS console open | No script executes; no console errors from injected content |
| C12 | Manually insert a forbidden tag directly into the database, then load the page as a speaker | Stripped at render time — read-time sanitization is the second layer and must be independently provable |

**C10 and C12 are the two steps that prove the design.** Verifying only what the page displays
would pass a render-only implementation, which is exactly what NFR-001 forbids.

## Journey D — Authorization

| Attempt | Expected |
|---|---|
| Signed-out request for `/portal/resources` | Rejected — authenticated portal content, never public |
| Signed-out request for a known page slug | Rejected |
| Speaker of event A requests a page of event B | Rejected |
| Reviewer calls `save` | Organizer-access error |
| Organizer of another event calls `save` with this `eventId` | Rejected |
| Organizer previews the portal view | Allowed — `assertOrganizerOrOwnsSpeaker` covers both, so preview needs no second code path |
| Public embed, attendee site, or a scoped API token | No route or scope reaches resource pages |

## Journey E — Judge verifies requirement 8

| Step | Action | Expected |
|---|---|---|
| E1 | Open the speaker portal | `Resources` present in the nav |
| E2 | Open Resources | Two seeded published pages |
| E3 | Open the one with an embed | Renders inline |
| E4 | Ask "is this sanitized?" | The organizer admin can demonstrate Journey C steps C1–C4 live in under a minute |

## Persistence checks

Pages, order, publication state, and `publishedAt` all survive reload and sign-out/sign-in.
Unpublishing retains content. Deleting is a hard delete and is confirmed before it happens.
</content>
