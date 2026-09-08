# Turso to Neon migration plan

## Current State

No active Turso/libSQL connection, schema, or environment variable was found. `@libsql/client` appears only as an unused package dependency/lockfile entry; the public app's database backend is Convex.

## Files/Env Vars to Change

- No Neon migration files or environment variables are required.
- During routine dependency cleanup, verify workspace packages do not import it, then remove `@libsql/client` from `package.json` and regenerate the lockfile.

## Schema/Query Differences to Handle

None: no Turso schema or queries were found.

## Effort Estimate

**S — under 1 hour**.

## Risk Notes

Treat this as a false positive; do not introduce Neon solely to replace an unused dependency.
