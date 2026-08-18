# Production deploy recovery runbook

Use this runbook when the `deploy` job triggered by a push to `main` fails after
the Convex deploy step. Do not merge another speculative fix while recovering:
each merge starts another production deploy.

The production target is `your-project`. It is intentionally named here
rather than derived from `CONVEX_DEPLOY_KEY`, so no credential is exposed in a
command, log, or run summary.

## Before a migration deploy

Take and retain a snapshot before merging any change that needs
`MIGRATION_TO_RUN`:

```sh
npx convex export --deployment your-project --path backup.zip
```

Store `backup.zip` somewhere access-controlled and outside the repository. If
file storage must be recoverable too, add `--include-file-storage` to the
export command.

Set the `MIGRATION_TO_RUN` repository variable immediately before the merge,
and clear it immediately after the deploy finishes, whether it succeeded or
failed. This avoids running a previous migration on a later merge.

## Migration failed mid-deploy

**Expected state:** the new Convex functions and schema are live; the Worker
step did not run, so the old frontend remains live. The Actions run summary
links here when it detects that state.

1. Confirm the state in the failed Actions run: `Deploy Convex and build` is
   successful, `Run migration` failed, and `Deploy to Cloudflare Workers` is
   skipped. Check the deploy run summary and Convex logs for the failing
   migration function.
2. Stop further merges until the migration is understood. Do not clear
   `MIGRATION_TO_RUN` until its value has been recorded in the incident notes.
3. If the migration is safe to retry and is idempotent, correct the migration
   code, merge the fix, and leave `MIGRATION_TO_RUN` set to that same function
   for the retry. Verify its run succeeds, then clear the variable.
4. If the migration partially changed data or cannot safely be retried, restore
   the pre-deploy snapshot as described below. Then deploy a compatible backend
   and frontend together before reattempting the migration.
5. Verify the live application after recovery, especially the flows guarded by
   the migrated data. A green Actions run alone is not sufficient.

## Worker deploy failed after Convex deploy and migration

**Expected state:** the new backend and completed migration are live, but the
old frontend remains live.

1. Confirm the first two deploy steps succeeded and inspect the Worker step's
   Wrangler output for the Cloudflare error.
2. Fix the Worker configuration or deployment credential issue. Do not rerun a
   non-idempotent migration: clear `MIGRATION_TO_RUN` before merging a
   Worker-only correction.
3. Merge the correction (or, for an emergency, use the documented clean-tree
   local escape hatch in `docs/deployment/production.md`). The next `main` push
   reruns the Convex deploy and Worker deploy; with the migration variable
   empty, it does not rerun the migration.
4. Confirm the subsequent run reports a Worker version and smoke-test the live
   application.

## Restore a Convex snapshot

Restoring overwrites existing documents in the snapshot's tables. Take a fresh
export first if there is any chance data changed after the incident, and get a
second operator to confirm the target deployment and snapshot file.

```sh
npx convex export --deployment your-project --path pre-restore-backup.zip
npx convex import --deployment your-project --replace backup.zip
```

The restore changes data only; it does not restore Convex functions, schema, or
environment variables. Afterwards, deploy a known-compatible commit and verify
the affected application flows. Keep both the original and pre-restore exports
until the incident is closed.
