# Sync namos-sessions-public from private main (RUN 2 — 2026-08-17, later same day)

## Why

`namos-sessions-public` (github.com/nayamoss/namos-sessions-public, PUBLIC visibility)
is the open-source mirror of this private `namos-sessions-webapp` repo. **This is the
second sync run today.** The first run produced PR #19 (merged, commit `053fafb` on
public/main), but private `main` kept moving after that PR's source snapshot was
taken — as of this run, public/main is **629 commits behind** private `main` again.
This sync must bring public current with private main's LATEST tip at the time you
run it (check `git log -1 origin/main` yourself — do not assume any specific SHA is
still current, it will have moved again by the time you execute), while preserving
every one of public's own OSS-safety commits' effects. It is not a force-push or a
blind merge.

## The 11 public-only commits (do not lose these — includes run 1's sync itself)

Run `git log origin/main..public/main --oneline` in the private repo to see the
current list. As of this writing (will grow if public gets more of its own commits
before you run — re-check):

- `053fafb` sync: port application code from private main (#19) — **run 1's sync**,
  merged earlier today. Treat this the same way as `c5e8234` below: read its diff as
  a second template for what a sync commit should look like, and do NOT re-apply
  work it already did — you're syncing the DELTA since this commit, not redoing it.
- `d004564` docs: remove non-project contact address from README/SUPPORT (#16)
- `c5e8234` sync: port application code from namos-sessions-webapp main (#14) — the
  original prior sync, template for the pattern.
- `025d00e` fix(communications): split page into Templates/Test/Activity tabs (#13)
- `7dcf1ba` fix(security): remove demo impersonation speaker picker from portal (#12)
- `2424417` docs: add costs-to-consider section and contact email (#11)
- `7603b13` feat(deploy): add one-click deploy support for Cloudflare/Netlify/Vercel/Railway/DigitalOcean (#10)
- `9e3f5e1` fix(security): remove maintainer's live custom domain from public wrangler config (#9)
- `dd07c40` Prepare the public repository for contributors (#1)
- `f186e90` docs: rebrand from Takumi Talks to Namos Sessions, cross-link sibling repos
- `4e1df05` Initial open-source release

## Non-negotiable safety rules

1. **Never let a secret, credential, or internal-only value reach the public repo.**
   Check every file that changed between the two repos' last sync point for:
   - Clerk secret keys, JWT issuer domains pointing at private instances
   - Convex deployment URLs/names that aren't meant to be public
   - Any `.env`, `.env.local`, or similar file — these must never be committed
   - The maintainer's live custom domain (`wrangler.jsonc` `routes`/`custom_domain`)
     — public commit `9e3f5e1` already established the pattern of stripping this;
     match it exactly for any NEW wrangler config that's appeared since
   - Any personal contact info beyond what public commits `2424417`/`d004564`
     deliberately chose to keep
2. **Never remove or weaken anything the 10 public-only commits added.** If a file
   both sides touched conflicts, the public repo's version of that specific
   safety/redaction change wins; everything else merges normally.
3. **This is a PR, not a direct push to public main.** Follow the exact pattern
   of `c5e8234` (the prior sync PR, #14) — same target repo, same review
   expectation, same branch-then-PR flow.
4. **If genuinely unsure whether something is safe to make public** (a new file,
   a new config value, anything that looks internal), do not guess — leave it out
   of the sync and flag it explicitly in the PR description for human review
   rather than silently including or silently dropping it.

## `worker/` is no longer excluded (as of 2026-08-17)

The first two sync runs (PRs #19, #21) each independently excluded `worker/`
wholesale, assuming it contained live secrets. It doesn't — see
`docs/features/public-worker-mirror/requirements.md` and its resulting PR (#24,
merged) for the full investigation. `worker/index.ts`'s only literal values are
public CSP domains; `worker/public-cfp.ts` reads every real secret via `env.*`
bindings, never hardcoded.

**Future sync runs should treat `worker/` like any other source directory** —
sync it normally, do not re-exclude it out of habit or by copying the old PR
descriptions' reasoning. The things that DO still need care in `worker/`:
- Swap the CSP's literal domain values (`clerk.namos-sessions.xyz`,
  `pastel-mosquito-479.convex.*`, the Sentry ingest URL) for the placeholder
  style already established in `worker/index.ts` on public/main
  (`clerk.your-project.example`, etc.) — don't let real domains slip back in.
- `worker-configuration.d.ts` is Wrangler-generated and bakes in literal values
  from whatever `wrangler.jsonc` it was generated against. If it changes on
  private main, regenerate public's copy via `npx wrangler types` against
  PUBLIC's own placeholder `wrangler.jsonc` — never copy private's generated
  file directly, it contains real production values as TypeScript literal types.
- `routes`/`custom_domain` in `wrangler.jsonc` still stays private-only.

## Acceptance criteria

- A PR is opened against `namos-sessions-public`'s `main` branch (not pushed directly),
  branched off the CURRENT public/main (which includes #19's `053fafb`) — not off
  #19's own source branch or any stale local ref
- The PR brings public's application code current with private `main`'s tip at
  execution time (re-check `git log -1 origin/main`, do not assume the SHA named
  in this doc is still current)
- All 11 of public's existing safety/redaction commits' effects are still present after the sync
- No secret, credential, internal URL, or personal contact info beyond what's
  already intentionally public is introduced
- Public repo's own CI/tests pass on the PR branch
- The PR description lists: what was synced, what was deliberately excluded and why,
  and anything left for human review
