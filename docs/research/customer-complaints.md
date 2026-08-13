# Customer complaints & pain points — CFP / program management

This is the differentiation surface. Organized by theme, each with a **weekend verdict**:
can this build credibly beat it by Aug 12, or not.

## Provenance caveat, read this first

**There is no meaningful public complaint corpus for Sessionboard specifically.** Capterra lists
it with **0 user reviews** ([Capterra](https://www.capterra.com/p/10028919/Sessionboard/)). It has
no G2 review page of substance. r/eventprofs threads naming it did not surface. It is a
small-vendor, sales-led product with a private customer base.

So: swyx's two first-hand claims — **it's noticeably slow**, and **its form validation is weak** —
are essentially the only direct evidence about Sessionboard, and they cannot be corroborated or
refuted from public sources. Do not claim in the submission that "users report Sessionboard is
slow." Say "the host reports" and then *demonstrate* the difference.

What *can* be corroborated is that these are the chronic complaints of the **whole category**,
which is nearly as useful. Everything below is real, sourced, and generalizes to Sessionboard.

---

## Theme 1 — Speaker-centric vs. submission-centric data model (biggest structural complaint)

The single richest source is [Paper Cuts — My Review of PaperCall](https://www.westerndevs.com/conference/services/Paper-Cuts-My-Review-Of-PaperCall/),
written by an organizer who ran a real conference on it. His complaints are model complaints, not
UI complaints:

- **"Communication is tied to individual talks rather than speakers."** A speaker who submits three
  proposals is three unrelated rows. You cannot see the person.
- **"Automated rejection/acceptance emails don't account for speakers with mixed outcomes across
  multiple submissions."** The classic disaster: one speaker receives an acceptance and two
  rejections in three separate emails, in random order.
- **"Organizers cannot search speaker profiles or discover alternate talk options."** When a talk
  falls through, you want to ask "what else did this person submit?" — you can't.
- No direct email access to a speaker unless they volunteered it separately.

Cadmium's own market writeup independently names the same gap: mid-sized conferences of 50–100
speakers have **"no centralized place for speakers to log in and see their schedule"** and
**"A/V teams working from outdated spreadsheets"**
([Cadmium](https://www.gocadmium.com/resources/speaker-management-software-for-events-what-to-look-for-in-2026)).

**Weekend verdict: BEATABLE, and cheap.** The plan already has a `speakers` table deduped by email
and a portal. Two additions make this a demo moment:
1. A **speaker detail view** listing *all* that person's submissions with statuses — one click from
   any submission row.
2. **Per-speaker consolidated decision email** — group decisions by speaker, send one email
   covering all of their submissions. This is a ~30-line change to the comms action and it is a
   thing every competitor named here gets wrong.

## Theme 2 — Reviewer/organizer grid is too rigid

Also from Paper Cuts:
- Hard 20-records-per-page limit, not configurable.
- Cannot sort by speaker. Cannot add columns. No filtering.
- Rating style chosen in settings isn't reflected in the display.
- **Free tier can't export unless talks are marked Accepted** — forcing a premature status change
  just to get your own data into a spreadsheet.

HotCRP's enduring popularity in CS academia is the inverse proof: its stated main strengths are
**"smart paper search and an extensive tagging facility"** ([HotCRP](https://github.com/kohler/hotcrp/blob/master/README.md)).
Organizers want query + tag, not more chrome.

**Weekend verdict: BEATABLE.** The plan's Abstracts grid (§0a screen 7) already specs columns
preferences, saved views, sort, filter, and CSV/XLSX export. **Make export unconditional and
available from every tab, including Drafts.** That one line — "export everything, always, no
paywall, no status change required" — is a direct hit.

## Theme 3 — Outdated, slow, unintuitive UI

EasyChair is the punching bag, and the criticism is remarkably consistent across 2024–2026:
- **"Design has changed little since its early years; what was functional in 2005 creates
  unnecessary friction"** ([Dryfta](https://dryfta.com/easychair-alternatives-for-academic-conference-management/)).
- **"An outdated interface is the most common complaint across review sites"**
  ([Fourwaves](https://fourwaves.com/blog/easychair-alternative/)).
- A conference chair's writeup calls it **"extremely unintuitive"** for first-time chairs, with
  documentation that answers little and options findable only by trial and error
  ([Not-So-EasyChair Hints](https://agiletribe.wordpress.com/2014/01/25/not-so-easychair-hints/)).
- Sessionize's cons in aggregate review data cluster on **limited customization**
  ([SoftwareWorld](https://www.softwareworld.co/software/sessionize-reviews/)).

**Weekend verdict: BEATABLE by construction, but only if you prove it.** A Vite SPA on Cloudflare's
edge against a sales-led React/Rails monolith is a fair fight you win on defaults. **Record a
side-by-side timing in the demo** — time-to-interactive on the public CFP form, and the abstracts
grid rendering 500 seeded rows. A number beats an adjective. Seed the demo base with enough rows
that "it's fast" is visible, not asserted.

## Theme 4 — Weak submission-form validation (swyx's specific complaint)

No public corroboration exists for Sessionboard specifically. But the category evidence supports
that validation is where these tools are thin:
- Sessionboard's own form builder exposes exactly one non-trivial validation concept —
  **cross-field character limits** — and nothing else beyond required/max-length (per the
  competition brief's screenshots, plan §0a screen 3 step 6).
- Pretalx's richer model — per-track/per-session-type field scoping, fields that become required
  after a date, per-session vs per-speaker question scope — shows what "real" validation looks like
  ([pretalx CfP docs](https://docs.pretalx.org/user/cfp/)).

**Weekend verdict: THE headline win, already correctly identified in plan §0a.** Do these, in order:
1. **Live combined counter for cross-field limits** (already planned — keep it).
2. **Server-side revalidation of every client rule.** Sessionboard's weakness is most likely
   client-only enforcement. Say so in the README and show a curl that gets rejected.
3. **Inline, per-field, on-blur errors with a submit-blocked summary** listing every failing field
   as a jump link. Trivial with react-hook-form + zod; it's what "weak validation" actually feels
   like the absence of.
4. **Draft autosave + a "you have unsaved changes" guard.** The #1 real-world CFP horror story is
   losing a long abstract. Cheap. Demos beautifully.

## Theme 5 — Pricing model resentment

- Sessionboard: per **accepted speaker**, so cost scales with exactly the number you can't reduce;
  Speaker CRM priced separately; SSO, custom email domain, and custom portal styling all gated
  behind Enterprise ([pricing](https://www.sessionboard.com/pricing),
  [review](https://agendaforge.app/blog/an-honest-sessionboard-review)).
- Sessionboard's pricing page currently renders **"$249 per month" identically under all three
  tiers** (verified 2026-08-08). Opaque *and* broken.
- PaperCall: "$499 Professional only adds read-only API access and bulk management — insufficient
  justification for mid-range conferences," with the author explicitly wanting a $200–300 tier
  ([Paper Cuts](https://www.westerndevs.com/conference/services/Paper-Cuts-My-Review-Of-PaperCall/)).
- EasyChair: per-submission billing (~$3.90+) means a successful CFP is a bigger invoice.
- Cadmium's buyer guidance literally advises **"pricing aligned to accepted speakers, not submission
  volume alone"** — the industry argues about which axis to meter, never about whether to meter.

**Weekend verdict: BEATABLE trivially — it's the premise.** Put a one-line cost table in the README:
Cloudflare Pages $0 + Airtable (their existing base) + Clerk free tier = $0/event, unlimited
speakers, unlimited submissions.

## Theme 6 — Integration and silo pain

- **"Software solutions turn into expensive headaches when systems can't communicate with abstract
  management, registration, and other conference platforms"**
  ([Cadmium](https://www.gocadmium.com/resources/speaker-management-software-for-events-what-to-look-for-in-2026)).
- Sessionboard does **not** do attendee registration/ticketing — buyers are advised to verify that
  boundary before purchase ([review](https://agendaforge.app/blog/an-honest-sessionboard-review)).
  So the $40k tool still needs a second tool next to it.
- Currinda and ConfTool win in the association market precisely by combining submissions +
  registration + payment in one system.

**Weekend verdict: PARTIALLY — do not chase.** The plan's Accelevents CSV-import stub (Phase 8) is
the right size. **But make the export side genuinely good**: a clean, documented JSON/CSV export of
the whole program (sessions, speakers, agenda, rooms) is the anti-lock-in argument, and it costs
almost nothing since the data lives in their Airtable base already. "Your data is in a base you own"
is a stronger integration story than any connector you could build in 72 hours.

## Theme 7 — Speaker-side experience is an afterthought

- No centralized speaker login to see their own schedule (Cadmium, above).
- Speakers get emails from a no-reply with "messy and unprofessional" reply addresses (Paper Cuts).
- Pretalx treats the speaker as a first-class user: their own profile, their own availability, their
  own resource uploads, and a notification with an `.ics` when their session gets scheduled or moved
  ([pretalx schedule docs](https://docs.pretalx.org/user/schedule/)).

**Weekend verdict: BEATABLE and it's already the plan's spine.** swyx annotated
"make sure this works" on submit→portal auto-redirect and "update your own bio data" on the profile.
Add one thing: **when the agenda changes a speaker's slot, email them with an updated `.ics`
(same UID, incremented SEQUENCE)**. See `architecture-patterns.md` §4. Pretalx does exactly this;
it is the single most-appreciated speaker-facing feature in the category and it is ~20 lines on top
of comms you're already building.

---

## Ranked shortlist — what to actually do with the remaining hours

| # | Change | Theme | Cost | Why it lands |
|---|---|---|---|---|
| 1 | Server-side revalidation + inline per-field errors + failing-field summary | 4 | S | Directly answers the host's stated complaint |
| 2 | Draft autosave + unsaved-changes guard on the public CFP form | 4 | S | Universal horror story, instant empathy |
| 3 | Speaker detail view showing all of that speaker's submissions | 1 | S | Structural gap in every competitor |
| 4 | Per-speaker consolidated decision email (mixed outcomes in one message) | 1 | S | Nobody does this correctly |
| 5 | Unconditional export from every grid tab, no status change required | 2 | S | Named, quotable complaint |
| 6 | Reschedule email with updated `.ics` (same UID, SEQUENCE+1) | 7 | S | Pretalx-validated, high perceived polish |
| 7 | Seed ~500 rows and show grid render + form TTI timings in the demo | 3 | S | Turns "it's slow" from claim into measurement |
| 8 | Speaker availability capture + honor it in conflict detection | 4/7 | M | See `README.md` — biggest missing feature |
