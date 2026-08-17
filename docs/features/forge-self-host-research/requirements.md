# Forge self-host — research and requirements doc (no deployment)

## Why

SmolForge (github: swyx/forge, hosted at forge.smol.ai) is a Git-hosting + CI/CD +
transcript-capture platform. Alpha registration on the hosted instance is closed, and
creating an account isn't an option here regardless. It's documented as "open source ·
self-hostable." Before anyone commits real time to self-hosting it, we need an accurate
picture of what that actually requires — the platform's own README describes it as
"thirteen independently released Workers" plus multiple D1 databases, R2, and Durable
Objects, which is a genuine infrastructure project, not a quick deploy.

## Task — RESEARCH ONLY, no deployment, no Cloudflare account access needed

1. Clone `https://github.com/swyx/forge` (read-only, public repo) into a scratch
   directory — do not touch any other project's files or git state.
2. Read the README in full, and `config/forge-components.json` (referenced in the
   README as the component graph declaration).
3. Find and read every Worker's own `wrangler.jsonc`/`wrangler.toml` across the repo —
   there should be roughly 13 of them per the README's architecture diagram (public
   edge, identity, content control, repository data plane, deploy-control, build
   runner, wiki, sites-edge, deployed-app runtime, notifications, content delivery,
   AI routing, Slack agents — confirm the exact list from the actual repo, not this
   description).
4. For each Worker, identify: what D1 database(s)/R2 bucket(s)/Durable Object
   binding(s)/KV namespaces it needs, what secrets/env vars it requires, and what
   other Workers it depends on (service bindings) — i.e. what order they'd need to
   be deployed in.
5. Look for any actual self-hosting guide, deployment doc, or setup script in the
   repo (search for SELF_HOST, DEPLOYMENT, SETUP, INSTALL, or similar files/docs
   folders). Report clearly whether one exists or not — do not fabricate steps if
   documentation is genuinely missing.
6. Identify what a self-hoster would need to provide themselves: Cloudflare account
   with Workers/D1/R2/Durable Objects access, DNS control for a domain, any third-party
   auth provider (Clerk?) or does Forge's own identity Worker handle auth
   independently, any AI provider keys for the AI routing Worker, etc.
7. Note any parts of the platform that appear to depend on smol.ai-specific
   infrastructure or accounts that a self-hoster could NOT replicate (anything
   hardcoded to forge.smol.ai, any smol.ai-owned service the code calls out to).

## Non-negotiable constraints

- Do NOT run any deploy command, do NOT authenticate to any Cloudflare account,
  do NOT create any Forge account, do NOT modify any file outside your scratch
  clone directory. This is read-only research against forge's own public source.
- Do NOT guess at missing information. If the actual self-host requirements aren't
  documented in the repo, say so plainly rather than inventing plausible-sounding
  steps.

## Acceptance criteria — deliverable

Write `docs/features/forge-self-host-research/self-host-plan.md` in THIS repo
(namos-sessions-webapp, not the forge clone) containing:

1. The real list of Workers and what each one needs (D1/R2/DO/KV/secrets/dependencies)
2. Deployment order (what must go first based on service-binding dependencies)
3. What a self-hoster must provide (accounts, credentials, domains) before starting
4. Whether official self-host docs exist, and if so a link/summary; if not, state that
   clearly as a real gap
5. A realistic time/effort estimate based on what you actually found, not a guess
6. Anything that looks like it can't be self-hosted as-is (smol.ai-specific
   dependencies) and would need to be worked around or is a hard blocker
7. A recommended next step — e.g. "ask swyx directly," "this specific Worker's
   config is undocumented and needs source-reading before anyone can proceed," etc.

This is a planning document for a human to read and decide from — not a task list
to execute autonomously. Do not attempt any of the actual self-hosting steps.
