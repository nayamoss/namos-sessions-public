# Competitor landscape — CFP & conference program management

Scope: the **program** side only (CFP intake → review → decision → agenda → speaker portal).
Registration/ticketing/marketing tools (Cvent, Bizzabo, Whova, Accelevents, Luma) are noted
only where they touch program.

Provenance rule used throughout: if a price is not published, this doc says so. No invented numbers.

---

## Quick pricing table

| Product | Model | Published price | Confidence |
|---|---|---|---|
| **Sessionboard** | Per accepted speaker + tier, annual contract | Tier page renders **"$249 per month" on all three tiers** — almost certainly a template bug, not real pricing. Every CTA is "Request a Demo". | **Low — treat as unpublished** |
| **Sessionize** | Per event occurrence | **Free** for free community events; **$499 USD + tax** per commercial event; custom bulk (5+ events/yr) | High — [published](https://sessionize.com/pricing) |
| **PaperCall** | Per event | **Free** (≤5 organizers, ≤200 submissions); **$499/event** Professional; Custom | High — [published](https://www.papercall.io/pricing) |
| **Pretalx** | Self-host free (Apache-2.0); hosted priced by attendee count × ticket price | Calculator-based, no fixed tiers; up to 25% community discount | Medium — [calculator](https://pretalx.com/p/pricing) |
| **Oxford Abstracts** | Per event tiers + add-ons | **$0–$1,800/event**; add-ons: Multi-stage $850, Symposium $850, Conference Website Builder $200, Certificates $150 | Medium — third-party aggregators ([TrustRadius](https://www.trustradius.com/products/oxford-abstracts/pricing), [Capterra](https://www.capterra.com/p/84611/Oxford-Abstracts/)) |
| **EasyChair** | Per submission, volume-tiered | ~**$3.90/submission** and up; fixed-price, pay-as-you-go, or deposit+final plans; Professional license is pay-as-you-go only | Medium — [license plans](https://easychair.org/docs/license_plans), [pricing](https://easychair.org/license_pricing?cc=USD) |
| **ConfTool** | Standard free for small events; Pro quoted | Pro is quote-only ("depends on requirements and size") | High that it's unpublished — [conftool.net](https://www.conftool.net/en/index.html) |
| **Currinda** | Quote-only | None published | High that it's unpublished — [currinda.com](https://www.currinda.com/) |
| **OpenReview** | Nonprofit, free | **$0** submissions and access | High — [about](https://openreview.net/about) |
| **HotCRP** | OSS (self-host) or free hosted for ACM-sponsored events | $0 for ACM events on hotcrp.com | High — [hotcrp.com](https://hotcrp.com/), [GitHub](https://github.com/kohler/hotcrp/) |

**The $40k/year number:** cannot be corroborated from public sources. Nothing Sessionboard
publishes explains it. What *is* public: they charge **per accepted speaker**, not per submission
([Sessionboard blog on pricing](https://www.sessionboard.com/blog/event-software-pricing-content-heavy-conferences)),
their org-level Speaker CRM is **priced separately**, and Enterprise gates SSO, custom email
domain, and custom portal styling. A large multi-track conference with hundreds of accepted
speakers plus CRM plus Enterprise add-ons is the plausible path to a five-figure quote.
State it that way in the submission; don't assert the $40k as a published figure.

---

## Sessionboard — the target

- **Site:** [sessionboard.com](https://www.sessionboard.com/)
- **Positioning:** "Speaker CRM" for conference organizers — content, speakers, sponsors,
  exhibitors, agenda, portals, AI, all in one. Explicitly **not** attendee registration/ticketing
  (verify-before-buy item per [this competitor review](https://agendaforge.app/blog/an-honest-sessionboard-review)).
- **Tiers:** Professional / Enterprise / Tailored.
  - Professional: speaker+sponsor+exhibitor management, email & SMS with templates and tracking,
    Sessionboard Studio (AI), 15+ integrations, roles/permissions/audit history.
  - Enterprise adds: document generation & Word editing, custom portal/form styling, custom email
    domain with analytics, Admin SSO + Portal SSO.
  - Tailored: white-labeling, advanced workflows, deep customization.
- **Pricing lever:** charges only for **accepted speakers**, not submissions. Nice-sounding, but it
  means cost scales with program size — exactly the thing a big conference can't shrink.
- **Marketing claims:** "2X time saved", "100,000+ speakers managed and onboarded".
- **Review presence is nearly zero.** Capterra lists Sessionboard with **0 user reviews**
  ([Capterra](https://www.capterra.com/p/10028919/Sessionboard/)). There is effectively no
  independent review corpus. This is why item 3 of the research leans on adjacent products.
- **Small credibility crack worth one line in the README:** their own pricing page currently
  renders `$249 per month` under all three tiers, including "Tailored". Verified 2026-08-08 at
  [sessionboard.com/pricing](https://www.sessionboard.com/pricing). A pricing page that renders
  the same placeholder for every tier is a fair, verifiable jab in a "kill my SaaS" submission.

**What the $40k buys that we are explicitly not building:** sponsor/exhibitor ops, CRM across
events, SMS, document generation, SSO, white-labeling, 15+ integrations. Say this plainly. The
claim is "the program lifecycle for $0", not "feature parity".

---

## Pretalx — the OSS reference implementation (study this one)

- **Repo:** [github.com/pretalx/pretalx](https://github.com/pretalx/pretalx) · Apache-2.0 ·
  Django / Python 3.12+ / PostgreSQL / Redis · 100% test coverage as a CI requirement.
- **Docs:** [docs.pretalx.org](https://docs.pretalx.org/) — the user guide is the single best spec
  document available for this problem domain. Read `/user/cfp/`, `/user/review/`, `/user/schedule/`.
- **Hosted:** [pretalx.com](https://pretalx.com/), priced by expected attendees × ticket price.

Pretalx is ~9 years of accumulated conference-organizer requirements, written down. Treat its
docs as a requirements checklist, not as competition. Concretely, the parts worth stealing:

### CfP model
- Questions are **per-session** or **per-speaker** — two distinct scopes, not one flat field list.
  ([cfp docs](https://docs.pretalx.org/user/cfp/))
- Field types: single/multi-line text, number, URL, date/time, boolean, file upload, single-choice,
  multi-choice.
- **Conditional visibility is scoped by track and session type**, not by arbitrary field-value
  predicates. i.e. "show `workshop prerequisites` only for the Workshop session type." That is a
  far cheaper and more useful conditional model than a generic `showIf(fieldId, equals)` rule —
  and it covers the majority of real cases.
- **Deadlines are per session type**, not just one global CfP close date. Lightning talks close
  later than full talks; this is normal.
- **A field can flip from optional to required after a date.** (Collect the bio later.)
- **Access codes**: single-use or unlimited, optional expiry, used to (a) extend the deadline for
  an invited speaker, and (b) unlock a hidden track/session type for invited-only submissions.
  This is how keynote invites happen inside a CFP tool.

### Review model
- **Review phases** with per-phase permissions: can reviewers write reviews, can speakers still
  edit, can reviewers set states. Phases auto-activate on date. Default: an anonymous review phase,
  then a de-anonymised selection phase.
- **Score categories** — multiple named scoring dimensions ("Content quality", "Relevance"), each
  with its own labeled scale, required/optional, optionally limited to a track. Weighted totals,
  aggregated across reviewers by **median or mean** (organizer's choice — median is the
  outlier-resistant default academics expect).
- **Independent categories** that record a flag (e.g. "first-time speaker") without affecting the
  ranking. Cheap, and a real DEI workflow.
- **Anonymisation** at two levels: hide speaker identity globally, *and* per-proposal manual
  redaction of identifying text. Note: uploaded resources cannot be anonymised, so they're hidden
  in anonymous mode.
- **Reviewer assignment** two ways: by team-and-track ("Security team sees only Security track")
  and by explicit per-proposal assignment. Visibility toggle: all proposals vs assigned only.
- **Pending state changes** — the recommended workflow. Mark accept/reject as *pending*, review the
  whole set, then apply in bulk once the emails are written. This is exactly Sessionboard's
  Accept Queue / Decline Queue, arrived at independently. Strong signal it's the right model.

### Schedule model
- **WIP schedule vs released versions.** Organizers edit a private WIP; releasing snapshots a named
  public version and forks a new WIP. Public consumers always see a stable version.
- Editor: time grid, rooms as columns, drag from an "unscheduled" sidebar; grid interval selectable
  at 5/15/30/60 min; condensed mode for many rooms.
- **Availabilities are first-class constraints.** Rooms have availability set by organizers.
  **Speakers submit their availability during the CFP submission.** Multi-speaker sessions use the
  *intersection* of their availabilities. Unavailable time is greyed out in the editor.
- Four conflict classes flagged: outside room availability, speaker unavailable, same-room overlap,
  speaker double-booked.
- Content types: sessions, **breaks** (span all rooms, public), **blockers** (reserve time,
  internal only). Only confirmed + timed + roomed sessions go public.
- **On release, optionally email speakers whose session was newly scheduled or moved, with an iCal
  attachment.** Pretalx converged on emailed `.ics` too — the plan's Risk #2 approach is validated.

### Comms
- Templated emails with placeholders, plus **cohort sends** to computed groups: "all unconfirmed
  speakers", "all rejected submitters", "all pending submitters"
  ([pretalx.com](https://pretalx.com/)). Cohort-by-state is the thing organizers actually use.

---

## Sessionize

- [sessionize.com](https://sessionize.com/) · the de-facto community-tech-conference CFP in Europe.
- **Free for free community events** (backlink appreciated, no internal/promotional/commercial use);
  **$499 + tax per commercial event occurrence**; bulk codes for 5+ events/year.
- All tiers get **all features** — paid tiers differ only by event type/volume and support priority.
  Full test mode without payment; you pay when you go public.
- Strengths: speaker profile reuse across events (a speaker's bio/talks follow them), public CFP
  discovery, schedule builder, API for embedding the agenda into your event site, low friction.
- Documented limits: "designed for simplicity, which is both its strength and its limitation" — no
  enterprise evaluation workflows, no speaker CRM, no content management, no AI, no deep
  integrations; not aimed at complex multi-track programs or large-scale speaker ops
  ([comparison writeup](https://agendaforge.app/blog/an-honest-sessionboard-review)).
- Aggregate review sentiment: praised for ease of use and support; cons cited as **limited
  customization** ([SoftwareWorld](https://www.softwareworld.co/software/sessionize-reviews/),
  [Slashdot](https://slashdot.org/software/p/Sessionize/)).

## PaperCall

- [papercall.io](https://www.papercall.io/) — Free (≤5 organizers, ≤200 submissions, anonymized
  submissions, custom rating, organizer feedback); **$499/event** Professional (20 organizers,
  unlimited submissions, API, webhooks, custom questions, bulk management, 24h SLA); Custom tier.
- Effectively in maintenance; still actively used for 2026 CFPs.
- The single best public teardown of a CFP tool is
  [Paper Cuts — My Review of PaperCall](https://www.westerndevs.com/conference/services/Paper-Cuts-My-Review-Of-PaperCall/).
  See `customer-complaints.md` — most of it generalizes.

## Oxford Abstracts

- [oxfordabstracts.com](https://www.oxfordabstracts.com/) — academic/medical abstract management.
- $0–$1,800 per event across 4 editions, plus per-event add-ons (Multi-stage review $850,
  Symposium $850, Website Builder $200, Certificates $150). Reviewers generally call pricing
  transparent and per-event flexible.
- Notable model detail: **multi-stage review is a paid add-on**, which tells you multi-round review
  is the thing academic organizers pay extra for.

## EasyChair

- [easychair.org](https://easychair.org/) — the incumbent in CS academia, ~$3.90/submission and up,
  volume-discounted; three payment schedules (fixed price prepaid / pay-as-you-go with a registered
  card / deposit + final).
- Strength: nobody gets fired for choosing it; everyone in CS already has an account.
- Weakness: universally described as having a 2005-era UI. See `customer-complaints.md`.

## ConfTool / ConfTool Pro

- [conftool.net](https://www.conftool.net/en/index.html) — ConfTool Standard is free for small
  non-commercial events; **Pro is quote-only**, scaled to event size and complexity. Handles many
  contribution types, sub-events, and combined submission+registration. German, very configurable,
  visually dated.

## Currinda

- [currinda.com](https://www.currinda.com/) — Australian; societies and PCOs. Submissions
  (abstracts, full papers, awards, grants) + registration + payments + badge printing in one.
  Quote-only. Relevant mainly as evidence that in the association market, **submissions and
  registration are expected in one system** — a boundary Sessionboard explicitly does not cross.

## OpenReview

- [openreview.net](https://openreview.net/about) — nonprofit, free to submit and free to read.
  Configurable openness (fully open review through double-blind). Its differentiator worth noting:
  **reviewer–paper matching at scale** using expertise modeling, bidding, constraints, and reviewer
  load balancing. Nothing in the conference-industry SaaS tier does assignment this well.

## HotCRP

- [hotcrp.com](https://hotcrp.com/) · [github.com/kohler/hotcrp](https://github.com/kohler/hotcrp/)
  — OSS (PHP + MySQL). Free hosted for ACM-sponsored events.
- Its distinguishing strengths are **paper search** and an **extensive tagging facility** —
  organizers drive the whole selection process from a search/tag query language rather than from a
  UI of checkboxes. Also: rebuttals and a PC-meeting mode.
- Lesson for us: power users of review tools want *saved queries and tags*, not more buttons. The
  plan's Saved Views on the Abstracts grid is the right instinct.

---

## Where this build sits

Nobody in the commercial tier is open source. Pretalx is open source and excellent but is Django,
self-hosted, and shaped for community tech conferences (no sponsor/exhibitor ops, no CRM, no
per-role participant minimums, no queue-staged decisions in the Sessionboard sense).

The credible one-line claim: **"the program lifecycle Sessionboard charges five figures for,
as a React app you can deploy on Cloudflare in ten minutes, on a backend you already own
(Airtable) — with the form validation Sessionboard doesn't have."**
