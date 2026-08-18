# Agenda data-loss investigation

## Status

Root cause unresolved; future occurrences are now diagnosable. Five `agenda_items` rows were deleted from the shared development Convex deployment, but the repository and retained Convex function logs do not show an application code path that performed the deletion. The fallback safety net records every application-level agenda create, update, publish, and delete, including a full row snapshot and actor. An application delete cannot commit unless its audit row commits in the same transaction.

## Reported incident

During authenticated agenda verification on 2026-08-13, the schedule grew to 10 rows. After sign-out and sign-in, only 5 rows remained. A direct `npx convex data agenda_items` query confirmed that this was database loss, not a stale or filtered UI query.

## Database and log evidence

The retained logs for development deployment `pastel-mosquito-479` establish the transition:

- `agenda:list` at 2026-08-13 09:36:15 EDT read 11 documents (the event-access check plus 10 agenda rows) and returned 5,165 bytes.
- `agenda:list` at 09:43:40 EDT again read 11 documents after an edit.
- `agenda:publishSchedule` at 09:49:09 EDT read 18 documents and wrote 5,305 bytes. Its source only patches unpublished rows.
- The immediately following `agenda:list` at 09:49:10 EDT still read 11 documents and returned 5,256 bytes, proving all 10 agenda rows survived publication.
- The first uncached post-auth `agenda:list` at 09:56:20 EDT read 6 documents (the access check plus 5 agenda rows) and returned 2,622 bytes.
- No `agenda:remove` call appears anywhere in the retained 1,000-entry function history, including the interval between the 10-row and 5-row reads.
- A fresh direct table query found exactly 5 surviving rows. All five have `updatedAt = 1786628949714`, matching the publish operation. Their creation times predate the loss.

Convex function logs cover queries, mutations, and actions. They do not attribute direct table edits, dashboard deletions, or administrative import/replace operations, so the evidence cannot distinguish among those out-of-band mechanisms.

## Code paths checked

### Direct deletion

A repository-wide search for `ctx.db.delete` and `agenda_items` found exactly one direct agenda deletion:

- `convex/agenda.ts` exports `remove`, which validates event access and the row's event before calling `ctx.db.delete(args.id)`.

No other mutation, action, internal function, scheduled function, or cron deletes an `agenda_items` row. Git history shows that `agenda:remove` has existed since agenda persistence was introduced; no historical bulk-delete implementation was found.

Crucially, the data adapter does not map or expose `agenda:remove`:

- `src/data/convex/index.ts` maps list, speaker list, conflict detection, save, and publish only.
- `src/data/transport.ts` permits `agenda.save` and `agenda.publishSchedule` writes only.
- `AgendaRepo` has no remove method.
- `src/pages/program/Agenda.tsx` contains no delete-session control or remove call.

Therefore the authenticated browser UI cannot invoke the server's dormant `agenda:remove` mutation through the repository transport.

### Authentication, organizer, onboarding, and event access

- `convex/organizers.ts`: `claimOwner` only inserts an organizer; `completeOnboarding` only patches that organizer; `add` inserts or patches an organizer; `remove` only deletes an organizer row.
- `convex/eventMembers.ts`: member removal only deletes the selected membership.
- `convex/events.ts`: event save and duplicate do not delete event data. The only deletes in this file remove one room or one track. Event duplication intentionally does not copy agenda rows, but it does not alter the source event.
- `src/App.tsx`, the data providers, and `AccountMenu`: sign-out changes Clerk authentication state and routing only. No cleanup/reset mutation is sent.
- The first post-sign-in reads briefly return no organizer/event data while auth is resolving, but that cannot delete database rows.

There is no application-level cascade-delete implementation for events, rooms, tracks, organizers, or onboarding that touches agenda rows.

### Seed and administrative scripts

- `convex/seed.ts` is a CLI-oriented mutation, but it is currently exported as a public Convex mutation. This is an existing security-boundary issue tracked separately in `docs/features/security-public-seed-boundary/`; it does not make the seeder destructive.
- It queries existing agenda rows for the demo event, then inserts each of three named fixtures only when a row with that title is absent.
- It contains no `delete`, `replace`, table clear, or import operation.
- Re-running `npm run seed:demo` can add a missing fixture; it cannot reduce the row count or overwrite non-fixture rows.
- Recent logs show several successful `seed:demo` runs before the agenda verification, not during the loss interval.
- No repository script invokes `convex import`, `--replace`, or another table-reset command.

### Publish, duplicate day, bulk operations, and client behavior

- `publishSchedule` collects every row for the event and patches only `isPublished` and `updatedAt` on unpublished rows. The log after publication proves it retained all 10 rows.
- Duplicate day maps every source session to the target date and calls `repo.agenda.save` without an id, so it inserts drafts. It does not inspect, overwrite, or delete target-day rows.
- The five closely spaced `agenda:save` calls at 09:36:15 EDT correspond to duplicate-day inserts; the subsequent list read 10 agenda rows.
- Search, filters, views, active-day selection, URL parameters, and event switching operate on client state or queries only.
- There is no bulk agenda-delete API or UI.

## Best hypothesis

The five rows were most likely removed outside the application function layer—such as direct Convex dashboard table edits or an administrative data import/replace—between 09:49:10 and 09:56:20 EDT. This is an inference, not a confirmed root cause. It fits both decisive facts: the physical rows disappeared, and no application mutation capable of deleting them ran in that interval.

A mistaken click inside the Takumi Talks UI is unlikely to explain the loss because no agenda delete control exists and the client cannot dispatch `agenda:remove`. A mistaken click in the Convex dashboard, or a separate CLI/database operation, cannot be ruled in or out from the retained logs.

## Reproduction result

The original trigger could not be reproduced or isolated from source and logs. A fresh sign-out/sign-in persistence check should record row ids/counts immediately before sign-out and immediately after sign-in. If the count changes again, preserve the exact wall-clock interval and audit Convex dashboard/admin activity in addition to function logs.

## Deeper follow-up (2026-08-13)

The follow-up investigation re-read every current `agenda_items` reader and writer, then exercised the most plausible missed edge cases against disposable records in the shared development deployment. It still found no application root cause for the five deleted rows.

### Dashboard and administrative audit surface

- Convex CLI `1.42.3` resolves the deployment dashboard and exposes function logs, data reads, exports, and deployment selection, but has no deployment-history or team-audit-log command.
- Convex documents the deployment History page as an audit log for configuration events such as function pushes, index changes, environment variables, and deployment state. It does not document row-level dashboard edits, bulk deletes, or imports there. Deployment History is also limited to Professional plans.
- The documented team Audit Log covers team/project/deployment administration and is also plan-gated. The CLI provided no way to query it for the incident interval.
- The retained 1,000 function entries were checked again. They still contain no `agenda:remove` in the loss interval. Direct administrative test queries do appear as `identityType: "instance_admin"`, but direct table writes are not represented as application mutations and the available logs do not identify an actor for the historical deletion.
- Local shell history contains old `npx convex data list` reads but no `convex import`, `--replace`, or agenda-table command around the incident. This only rules out commands retained in this machine's shell history; it cannot rule out another terminal, machine, dashboard user, or expired history.

### Mutation and concurrency audit

- A second repository-wide search found no `ctx.db.replace` call at all. `agenda:save` is the only agenda upsert and uses `ctx.db.patch` for an existing id or `ctx.db.insert` when no id is supplied.
- Two simultaneous full `agenda:save` calls against one disposable row both returned the same id. The row count increased from 5 to 6 only for the probe, remained 6 after both writes, and the surviving row contained the later full payload with `calendarSequence = 2`. Concurrent editors can therefore overwrite one another's fields with stale full-form values, but cannot delete the document.
- A simultaneous `agenda:publishSchedule` and `agenda:save` against that row also retained it (count 6) and left it published with `calendarSequence = 3`. Convex mutations are transactional and use serializable optimistic concurrency control, so conflicting executions are retried/serialized rather than partially committed.
- The disposable row and room were removed after the probe, restoring the shared deployment to its 5-row baseline.

### Duplicate-day target protection

The actual duplicate-day implementation filters only the in-memory source date, maps each source start/end time to the target date, and calls `repo.agenda.save` without an `id`. The transport maps that call only to `agenda:save`, whose no-id branch performs `ctx.db.insert`. It never queries, patches, replaces, or deletes target-day rows. Existing target-day sessions therefore cannot be overwritten by this feature. `Promise.all` can yield an error after some independent inserts have succeeded, which could leave a partial set of extra drafts, but that failure mode adds rows rather than deleting them.

### Room, track, and membership deletion probes

The schema stores document ids as references but defines no cascading-delete behavior. This was verified live instead of relying only on source inspection:

1. A disposable room, track, and agenda row were created in `QA Journey Event B`.
2. `events:removeRoom` deleted the room. A direct read by agenda id still returned the complete agenda row with its original `roomId`.
3. `events:removeTrack` then deleted the track. A second direct read still returned the agenda row with its original `trackId`.
4. A disposable reviewer membership was added and removed. The deployment-wide agenda count remained 5 before and after the membership operation.
5. All remaining disposable probe data was cleaned up and direct reads confirmed it was gone.

These results rule out application-level and platform-level cascades from room, track, or event-membership deletion as the incident cause.

## Recommended follow-up

1. Repeat the flow against a disposable event while recording the exact agenda row ids and count before and after authentication.
2. Avoid direct table editing and `convex import --replace` during the run; record every CLI command and dashboard action.
3. If loss recurs without an `agenda:remove` log, escalate to Convex support with the deployment name, row ids, and exact timestamps so platform/admin audit data can identify the writer.
4. Consider removing the currently unreachable public `agenda:remove` mutation or exposing deletion only through an audited, confirmation-gated UI in a separate change. This would reduce attack surface but would not explain or fix this incident.

## Deep-dive follow-up and safety net (2026-08-13)

The remaining delayed-execution, schema-deployment, automatic-seed, and incident-window history angles were investigated without repeating the application-path and concurrency work above. No root cause was established. A durable audit trail was therefore implemented so a recurrence can be attributed to application code or identified as out-of-band.

### Cron jobs and scheduled functions

A complete search of `convex/` found no cron configuration (`cronJobs`, `crons`, or a cron export) and no `ctx.scheduler.runAt` call. The only scheduler calls are:

- `publicForms:submit` schedules `confirmationEmailActions:deliver` with `runAfter(0)`.
- `portalFormResponses:submit` schedules `portalFormConfirmationActions:deliver` with `runAfter(0)`.

Both targets are email-delivery internal actions. Their call trees record confirmation/comms state and do not query, patch, replace, or delete `agenda_items`. There is no delayed agenda function capable of waking after sign-out.

Convex documents that scheduled functions are created explicitly through `ctx.scheduler`, are visible in the Functions/dashboard tooling, and execute as function calls. There is no implicit scheduling mechanism associated with authentication or query subscriptions. See [Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions).

### Schema and index deployment behavior

The `agenda_items` schema history contains no optional-to-required narrowing or incompatible type change:

- The original table introduced the still-required event, title, room, time, speakers, publication, and timestamp fields together.
- Later agenda-shape changes added `videoUrl`, `locationDetails`, `calendarUid`, and `calendarSequence` as optional fields.
- Later index additions changed lookup structures only; they did not change document validation.

The active schema uses default validation (`schemaValidation` is not disabled). Convex validates every existing document on the first push of a changed schema and fails the push if any row is invalid; it does not silently delete nonconforming documents. Future inserts and updates are rejected if they do not match. Convex's production guidance specifically requires optional-field backfills before making a field required. See [Schemas — Schema validation](https://docs.convex.dev/database/schemas#schema-validation) and [Making safe schema changes](https://docs.convex.dev/production/overview#making-safe-changes).

Therefore neither an index deployment nor a validator narrowing explains five silently removed rows. An invalid narrowing would have produced a failed function push while leaving all rows intact.

### Seed and hot-reload triggers

Repository-wide caller tracing found `seed:demo` only in the manual `npm run seed:demo` package script and operator documentation. No React effect, server startup hook, Cloudflare/hosting script, CI workflow, Convex function, scheduler, or deploy callback invokes it.

`npx convex dev` watches function/schema files and pushes updated code. It runs a function only when explicitly started with `--run`; ordinary hot reload repeats the code-push step and does not invoke exported mutations merely because their module was evaluated. The app's `npm run dev` command is only `vite`, with no `--run seed:demo` wrapper. See the [`npx convex dev` lifecycle](https://docs.convex.dev/cli/reference/dev).

Even an explicit seed invocation remains additive for agenda data: it queries the demo event's agenda and inserts a missing named fixture. It has no agenda delete, replace, reset, or overwrite branch. Automatic seed execution was not found and would not fit the observed count reduction.

### Incident-window git and administrative mutation evidence

All reachable refs, reflogs, stashes, unreachable commits, and retained unreachable blobs were searched for temporary `agenda_items` cleanup code. Committed agenda history contains only the normal `agenda:remove` single-row delete. No committed or recoverable `seed.ts` blob contains `dedupeAgendaItems` or an agenda bulk-delete loop, and there was no agenda-shape commit between the last 10-row read and the first 5-row read.

Retained Convex logs do prove that a short-lived, uncommitted admin mutation named `seed:dedupeAgendaItems` had been pushed to the shared development deployment and manually invoked twice inside the incident window:

- 09:54:38 EDT: read 10 documents, `databaseWriteBytes = 0`.
- 09:55:12 EDT: read 15 documents, `databaseWriteBytes = 0`.

Both calls used `identityType: "instance_admin"`; neither committed an insert, patch, replace, or delete. The mutation therefore did not remove the five rows. Its presence does confirm that ad-hoc admin functions were being hot-pushed and run against the shared deployment during the incident, but the retained metrics do not support attributing the loss to this particular function. Its source never entered Git, so its intended dry-run/result behavior cannot be reconstructed beyond the execution metrics.

### Implemented audit safety net

`agenda_items_audit` is an append-only table indexed by event/time and agenda-item/time. Each application-level agenda mutation records:

- operation (`create`, `update`, `publish`, or `delete`),
- actor identifier and mutation source (`system:seed` for fixture creation),
- agenda item id and event id,
- the complete agenda row snapshot,
- audit timestamp.

`agenda:remove` inserts the audit row and emits a structured `agenda_item_deleted` Convex log line before calling `ctx.db.delete`. Convex mutations are transactional, so the delete cannot commit without its audit evidence. Create, update, and publish also write snapshots, providing a last-known record even if a later deletion occurs through the dashboard or an import.

The table is intentionally independent of the UI. Investigators can inspect it directly with `npx convex data agenda_items_audit` or the Convex dashboard. Convex has no database trigger that can intercept dashboard deletes or `import --replace`; if a row disappears with no `delete` audit entry, that absence—combined with its last create/update/publish snapshot—identifies the removal as out-of-band. A regression test locks the audit-before-delete ordering and all four operation hooks.

### Updated conclusion

The root cause remains unproven. Delayed jobs, schema enforcement, seed hot reload, and the only known incident-window ad-hoc mutation are now ruled out by source, platform semantics, or zero-write execution metrics. The best-supported hypothesis remains an out-of-band dashboard/import/admin write for which row-level audit history was unavailable.

If loss recurs, preserve the affected ids and timestamps, query `agenda_items_audit` by item/event, and compare the structured delete log. A matching delete entry identifies the actor and application source; no entry identifies a write that bypassed application mutations and provides Convex support with a narrow interval plus the last complete row snapshots.
