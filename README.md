# Namos Sessions

[![CI](https://github.com/nayamoss/namos-sessions-public/actions/workflows/ci.yml/badge.svg)](https://github.com/nayamoss/namos-sessions-public/actions/workflows/ci.yml)
[![CodeQL](https://github.com/nayamoss/namos-sessions-public/actions/workflows/codeql.yml/badge.svg)](https://github.com/nayamoss/namos-sessions-public/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-006BFF.svg)](LICENSE)

Open-source conference program management for CFP forms and submissions, speaker portals,
review, scheduling, and communications.

> **Project status:** This public mirror is in active pre-1.0 development. APIs and data models
> may change between releases. Issues and pull requests belong in this repository; the private
> product's own feature backlog, internal docs, and production deployment secrets remain in the
> primary application repository. Instructions for deploying **your own copy** of this repo
> live here — see [`docs/deployment/one-click.md`](docs/deployment/one-click.md).

## Deploy your own copy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nayamoss/namos-sessions-public)
[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/nayamoss/namos-sessions-public/tree/main)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/nayamoss/namos-sessions-public)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnayamoss%2Fnamos-sessions-public&env=CONVEX_DEPLOY_KEY%2CVITE_CLERK_PUBLISHABLE_KEY&envDescription=Add%20a%20production%20Convex%20deploy%20key%20and%20your%20Clerk%20publishable%20key.&envLink=https%3A%2F%2Fgithub.com%2Fnayamoss%2Fnamos-sessions-public%2Fblob%2Fmain%2Fdocs%2Fdeployment%2Fone-click.md)

Railway support is configured in [`railway.json`](railway.json), but its one-click button remains
unavailable until a maintainer publishes the template. The generated
`https://railway.com/new/template/<template-id>` URL belongs here and in the deployment guide;
see the [provider-specific setup and security requirements](docs/deployment/one-click.md).

## What it includes

**Event setup**
- Onboarding wizard, event details, dates, timezones, branding, dashboard summaries, CSV import
- Organizer/team access, API keys, reusable form templates, and shared field libraries
- Responsive, accessible UI with dark mode, keyboard shortcuts, and a command palette — fully
  usable from a phone or tablet browser, no separate app required

**CFP and submissions**
- Configurable CFP form builder — sections, reusable fields, rich text, validation, required
  fields, character limits, templates, duplication, and publishing controls
- Category and track routing rules
- Public submission pages with email verification, confirmation, and validation
- Submission statuses, tags, filtering, search, pagination, exports, bulk actions, and
  speaker-controlled edits

**Review and selection**
- Evaluation plans, criteria, scorecards, scoring scales, comments, rounds, and reviewer
  assignment (including assignment by filter)
- Blinded/anonymized review, reviewer progress tracking, reminder workflows, and decision queues

**Speaker operations and portal**
- Speaker profiles, bios, proposals, documents, and file collection
- Speaker portal with custom forms, submission editing, and schedule access
- Availability collection with date/time-part blocking and travel notes
- Speaker tasks, due dates, and readiness tracking

**Agenda and scheduling**
- Session, room, track, speaker, date, and time management
- Drag-and-drop agenda moves, multiple calendar views, and calendar invitation generation
- Conflict detection for speakers, rooms, tracks, and overlapping sessions

**Communications and public program tools**
- Communication templates with tokens and rich text; submission, decision, reminder, and
  calendar-invite email workflows, with delivery history
- Public CFP/program embeds (agenda, schedule grid, speaker gallery) with an editor and preview
- Public events API and API-key management

**Sponsorship**
- Sponsor records, tiers, contacts, and sponsor workflow support

**Content sync (bring your own account)**
- Notion and Airtable CFP/portal content sync via OAuth — connect your own workspace or base,
  scope access to one database or table, and import speakers or submissions directly

## Coming soon

- **Sanity CMS sync** — publish confirmed sessions and speakers to a Sanity dataset. Scaffolding
  exists; not yet verified end-to-end against a real Sanity project.
- **Native iOS and Android apps** — a native companion is in development; the web app already
  works fully on mobile browsers today.
- **Organizer-owned, multi-page form builder** — CFP and portal forms move from a fixed section
  layout to organizer-defined, reorderable pages, with a live preview that renders through the
  exact same component the real public page uses.
- **AI-assisted review scoring** — a non-binding AI first-pass score and rationale alongside
  human review; human review and decisions remain fully authoritative either way.
- **Live-refreshing readiness dashboard** — currently loads once per visit rather than updating
  in real time.
- **Portal resource/wiki pages** — a shared knowledge-base area in the speaker portal, separate
  from per-speaker tasks and files.

## Related repositories

Namos Sessions is split across repos:

| Repo | Visibility | Purpose |
| --- | --- | --- |
| **[namos-sessions-webapp](https://github.com/nayamoss/namos-sessions-webapp)** | Private | Primary application source — full feature set, internal docs, CI |
| **[namos-sessions-public](https://github.com/nayamoss/namos-sessions-public)** (this repo) | Public | Open-source mirror of the app for community use and contributions |
| **[namos-sessions-marketing](https://github.com/nayamoss/namos-sessions-marketing)** | Private | Marketing site, landing pages, and content for Namos Sessions |
| **[namos-sessions-ios](https://github.com/nayamoss/namos-sessions-ios)** | Private | Native iOS companion app |

## Data backends

Feature code uses `src/data`, never `convex/react` or an Airtable client. Convex is the primary
data backend. Airtable is an intentionally limited secondary adapter:
it is reachable only through a server-side Pages Function, verifies a Clerk session server-side,
and checks that identity against the Convex `organizers` table. Operations without a safe scoped
mapping fail explicitly rather than exposing Airtable credentials or internal records.

Set `VITE_DATA_BACKEND=convex` for local and demo work. Set it to `airtable` only when the
Cloudflare Pages Function has its server-only `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`,
`CLERK_SECRET_KEY` (or `CLERK_JWT_KEY`), and `CONVEX_URL` values. The Convex deployment must
have organizer records configured. Airtable mode also requires the client-visible
`VITE_CLERK_PUBLISHABLE_KEY` so the browser can obtain its current session token. Configure
these values in Cloudflare and Convex, never in source control.
The Airtable token must never be exposed as a `VITE_` variable.

The optional submission, decision, reminder, and portal-form email handlers require
server-only `CONVEX_URL`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` values. When those
are absent, a saved workflow stays successful and the handler reports delivery as skipped
rather than claiming an email was sent.

## Where things live

- **Feature docs** — `docs/features/<feature-name>/` (one folder per feature: `requirements.md`, `plan.md`, `design.md`)
- **Convex backend** — `convex/` (functions, schema, seed data)
- **App source** — `src/`, with the Convex/Airtable boundary isolated in `src/data`
- **Product notes** — `PRODUCT.md`

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

For a Convex-backed local demo, configure the two Convex values in `.env`, then synchronize the
functions and load the repeatable demo dataset:

```bash
npx convex dev
npm run seed:demo
```

`seed:demo` is intended to be re-runnable against the configured Convex deployment. It creates
representative event data, including submissions across statuses and scheduling conflicts. It does
not configure a deployment, email provider, or authentication for you.

## Commands

- `npm run build` — production build
- `npm run test` — test suite
- `npm run typecheck` — app and Convex TypeScript checks
- `npm run lint` — lint
- `npm run check` — repeatable local handoff check: typecheck, tests, and production build
- `npm run seed:demo` — populate the configured Convex deployment with demo data

## Contributing

Issues and pull requests are welcome here. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
architecture boundaries, and the pull-request checklist.

- [Get support](SUPPORT.md)
- [Report a vulnerability privately](SECURITY.md)
- [Read the Code of Conduct](CODE_OF_CONDUCT.md)
- [Understand project governance](GOVERNANCE.md)

## Measured performance

Measured locally on 2026-08-12 from the production build and a seeded Convex development
deployment. Five cache-disabled reloads of the public CFP route in headed Chromium, timed from
browser reload until the form heading was visible, took **257, 212, 203, 205, and 205 ms**
(**205 ms median**, 203–257 ms range). This is an end-to-end local measurement, not a claim about
the separately deployed site.

The production assets required by that route total **178.20 kB gzip**: 100.52 kB application
entry, 60.44 kB React vendor, 13.01 kB CSS, and 4.23 kB route-specific CFP JavaScript. The public
route is code-split; its load does not include the form builder, evaluation, agenda-admin, or rich
text editor chunks. Re-run `npm run build` after material dependency or routing changes before
reusing these figures.

## Product boundaries

This is not multi-tenant: records are scoped by `eventId`, not organizations. The project has
no organization table, `organizationId`, or Clerk Organizations dependency.

## Costs to consider before deploying

Running your own copy means running your own accounts with each service below. This project's
free tiers are enough for local development, a demo, or a small event — check current pricing
before a larger one, since limits and plans change:

- **Convex** (primary data backend) — free tier covers function calls, storage, and bandwidth up
  to a monthly cap; paid plans scale by usage. See [convex.dev/pricing](https://www.convex.dev/pricing).
- **Clerk** (auth) — free tier covers a meaningful number of monthly active users; paid plans
  scale per MAU past that. See [clerk.com/pricing](https://clerk.com/pricing).
- **Resend** (optional, email delivery) — free tier is capped on emails per day/month; if you skip
  it, submission/decision/reminder emails report as skipped instead of failing. See
  [resend.com/pricing](https://resend.com/pricing).
- **Airtable** (optional secondary adapter) — only relevant if you enable `VITE_DATA_BACKEND=airtable`;
  has its own separate pricing and API rate limits.
- **Hosting** (Cloudflare Workers, Netlify, Vercel, Railway, or DigitalOcean App Platform — pick
  one via [`docs/deployment/one-click.md`](docs/deployment/one-click.md)) — free/hobby tiers exist
  on most of these, but request volume, build minutes, and bandwidth caps vary by provider and
  change over time. DigitalOcean App Platform in particular does not have an indefinite free tier.

None of these costs are billed by or paid to this project — you're setting up and paying for your
own accounts directly with each provider.

## Questions or help

Best effort only — see [SUPPORT.md](SUPPORT.md) for what that means.
