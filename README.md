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

## What it includes

- Configurable CFP and speaker-portal forms
- Submission review, scoring, assignments, and decision queues
- Speaker profiles, documents, availability, tasks, and readiness tracking
- Agenda scheduling with room, speaker, and track conflict detection
- Email templates, reminders, delivery history, and calendar invitations
- Sponsor workflows, public embeds, and an event API foundation

## Related repositories

Namos Sessions is split across three repos:

| Repo | Visibility | Purpose |
| --- | --- | --- |
| **[namos-sessions-webapp](https://github.com/nayamoss/namos-sessions-webapp)** | Private | Primary application source — full feature set, internal docs, CI |
| **[namos-sessions-public](https://github.com/nayamoss/namos-sessions-public)** (this repo) | Public | Open-source mirror of the app for community use and contributions |
| **[namos-sessions-marketing](https://github.com/nayamoss/namos-sessions-marketing)** | Private | Marketing site, landing pages, and content for Namos Sessions |

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
