# Data adapter

## Outcome

Feature code talks only to a repository interface. The hosted judged demo uses Convex; Airtable
ships as a working, test-covered second implementation.

## Scope

- **Prune the Kanrei fork first.** Delete `convex/{controls,evidence,frameworks,incidents,
  policies,risks,trustCenter,trustCenterPublic,vendors,questionnaires,monitoring,integrations,
  seedTaskPacks}.ts` and their matching `src/pages/*` and `src/hooks/use-*`. Keep
  `notifications` and `convex/tasks.ts` as a module-structure reference only. **Also delete
  `organizations` / `organization_members` and every `requireOrgId` helper — this app is not
  multi-tenant, it scopes by `eventId` (see [Architecture](../../ARCHITECTURE.md)).**
- **Verify what survived the prune** before later phases assume it: a Convex file-upload helper
  independent of the deleted `evidence.ts`, and `src/components/editor/RichTextEditor.tsx`.
  Both are load-bearing for speaker docs and rich-text fields.
- Rewrite `src/components/AppLayout.tsx` `navSections` and `src/App.tsx` routes to the
  Program / Portals / Configure IA (see [Context](../../CONTEXT.md)).
- Add `src/data/types.ts`, `repo.ts`, a provider, `convex/`, and `airtable/` implementations as
  specified in [Architecture](../../ARCHITECTURE.md). Domain types use branded `string` ids —
  no Convex `Id<>` types leak past the interface.
- Expose thin async interfaces: events, forms/fields, submissions, speakers, evaluations, agenda,
  tasks, comms, and availability. Keep business operations explicit: `submit`, `saveDraft`,
  `decide`, `publishSchedule`; do not create a generic ORM facade.
- Resolve `VITE_DATA_BACKEND` once in the provider. Default safely to Convex only for local/demo
  configuration; document every required variable in `.env.example`.
- Put Airtable behind a Cloudflare Pages Function. Verify Clerk identity there and derive tenant
  scope server-side. The browser never receives an Airtable token or an organization id to trust.

## Airtable contract

- Real base with one mapped table per Convex table; linked speaker records map to `string[]`.
- Queue writes at 4 req/s, retry 429 after 30s, use `typecast: true`, and batch at 10 records.
- Fetch/join once per list request, poll only the visible page at >=30s, and add 30–60s KV caching
  before exposing an Airtable deployment.
- Store storage keys, not Airtable attachment URLs.

## Acceptance and tests

- One contract suite runs against a seeded Convex adapter and Airtable adapter: event isolation,
  list/filter mapping, idempotent decision, linked speakers, and no attachment URL persistence.
- An unauthorized actor cannot read or mutate another event through either implementation.
- README includes backend switch, base-template instructions, and the honest Convex-demo rationale.

## Dependencies

First implementation phase. Every feature depends on it; do not import Convex hooks directly from
feature components.
