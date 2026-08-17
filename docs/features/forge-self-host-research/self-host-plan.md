# SmolForge self-hosting: source-verified assessment

Research date: 2026-08-17. This is read-only research against the supplied
Forge source checkout at `/tmp/forge-research-2026-08-17/forge-src`; no Forge
or Cloudflare deployment was attempted.

## Bottom line

Forge is self-hostable only in the sense that its source is present and it runs
on Cloudflare primitives. It is **not** a one-command, documented self-host
install. The current source is an access-controlled, production-configured
13-Worker Cloudflare platform. A usable independent deployment requires
replacing checked-in production identities/domains/policies, provisioning its
Cloudflare resources, applying the database schema, configuring multiple
external credentials, and validating a nontrivial dependency graph.

The README calls this out as thirteen independently released Workers
(`README.md`); the machine-readable component declaration is
`config/forge-components.json`.

## Official documentation finding

There is no checked-in `SELF_HOST`, installation, or operator self-hosting
guide that tells a new operator how to provision and deploy Forge. Searches of
the repository root and `docs/` found Deploy product/operator documents, not a
Forge-platform installation guide.

The closest material is:

- `packages/api/src/routes/deploySpecPage.ts` has a “Forge can deploy Forge”
  section. It describes the existing hosted
  system's exact-SHA self-*deployment* and says Wrangler administrator access
  is its break-glass path; it is not bootstrap documentation.
- `docs/architecture/platform-components.md` describes the production component
  architecture and some release ordering.
- `docs/operations/production-deployment.md` is an operational runbook for the
  existing production release system.
- `docs/deploy/README.md` explicitly says customer-managed Cloudflare accounts
  and secrets are roadmap
  work for Forge Deploy. That concerns customer application hosting, but is a
  strong signal that it is not an independently supported Forge installer.

## Worker inventory and required bindings

The table below is transcribed from every platform Worker `wrangler.toml` in
the source (`packages/{edge,identity,content-control,repository,deploy-control,
notifications,runner,sites-worker,deploy-runtime,wiki-worker,content-worker,
ai-router,slack-agent}/wrangler.toml`). “None” means none declared in that
Worker configuration; no Worker declares a KV namespace.

| Component / Worker | D1, R2, DO, KV and other platform bindings | Required secrets; important configuration | Service dependencies |
| --- | --- | --- | --- |
| edge / `cloudforge-edge` | Static Assets; no D1/R2/DO/KV | Custom route is `forge.smol.ai`; `SSR_ROLLOUT` | identity, repository, content-control, deploy-control, content |
| identity / `cloudforge-api` | D1 `cloudforge-next`; cron | `JWT_SECRET`, invite hash, Better Auth secret, Google OAuth ID/secret, identity-broker secret, encryption key, and Slack OAuth/app/state secrets. Origin, passkey RP ID, admin IDs and Slack URLs are set to `forge.smol.ai`. | none |
| content-control / `cloudforge-content-control` | D1 `cloudforge-next`; R2 `cloudforge-git-objects`; cron | Production origin/admin IDs in vars; no `[secrets]` block | identity RPC (`IdentityControl`) |
| repository / `cloudforge-repository` | D1 `cloudforge-next`; R2 Git objects, agent artifacts, SKIT blobs, Wiki assets; `RepoLock` DO; two Workflows; Workers AI; cron | Context HMAC, invitation key, event-ticket secret, two Wiki secrets; many production-only Wiki/agent policies and origin/admin vars | identity RPC; runner; Wiki; notifications |
| deploy-control / `cloudforge-deploy-control` | D1 `cloudforge-next`; R2 site assets; `ForgeProductionReleaseLease` DO; cron | Context HMAC, identity-broker secret, production Cloudflare API token; checked-in Cloudflare account ID, `.sites.smol.ai` suffix, admin IDs | identity RPC; runner; deploy-runtime; repository workflow RPC |
| notifications / `cloudforge-notifications` | D1 `cloudforge-next`; `send_email` binding; cron | `INVITATION_TOKEN_KEY`; sender is hardcoded as `invites@forge.smol.ai`; origin var | none |
| runner / `cloudforge-ci-runner` | D1 `cloudforge-next`; R2 CI cache, site assets, Git objects, agent artifacts; `CISandbox` container-backed DO; four Workflows; cron | context HMAC, Cloudflare API token, R2 access key/secret. Also account ID, Forge/service/domain names, runner image digest, and `CI_DEPLOY_POLICIES` containing hosted-account resource IDs. | deploy-runtime; deploy-control's `ProductionBuilderControl`; Cloudflare provider APIs |
| sites-edge / `cloudforge-sites` | D1 `cloudforge-next`; R2 site assets; Analytics Engine dataset; dispatch namespace; no DO/KV in this Worker | context HMAC and identity-broker secret; wildcard route, host suffix and control origin are `*.sites.smol.ai` / `forge.smol.ai` | deploy-runtime; identity RPC; dispatch outbound targets deploy-runtime |
| deploy-runtime / `cloudforge-deploy-runtime` | `ForgeAppShard` and `ForgeProjectQuota` DOs | context HMAC (AI-router secret optional); no D1/R2/KV | AI router |
| wiki / `cloudforge-wiki` | D1 `cloudforge-next`; Git and Wiki-assets R2; Wiki Workflow; Workers AI; daily cron | Wiki encryption/internal-token secrets; optional AI Gateway token. Account ID and gateway ID are configured for the hosted account. | no Worker Service Binding; Workers AI / configured AI Gateway/providers |
| content / `cloudforge-content` | D1 `cloudforge-next`; R2 content assets | no `[secrets]`; content enablement and hosted origin vars | identity RPC |
| AI router / `cloudforge-ai-router` | D1 `cloudforge-next` plus separate `cloudforge-ai-usage`; Workers AI | `FORGE_AI_ROUTER_SECRET`; optional OpenAI, Gemini and Featherless keys. Provider/model/budget vars choose Workers AI by default. | external configured AI providers |
| Slack agent / `cloudforge-slack-agent` | Separate D1 `cloudforge-slack-agent`; Slack Workflow; cron | Slack app ID and signing secret; custom route `slack.forge.smol.ai`, hosted Forge API URL | identity's `SlackIntegrationControl` RPC |

The shared `cloudforge-next` physical D1 is intentional in the current source,
although the architecture says it is a temporary migration boundary. The three
configured D1 databases are `cloudforge-next`, `cloudforge-ai-usage`, and
`cloudforge-slack-agent`; the configurations name seven distinct R2 buckets.

## Deployment order and dependency caveat

First provision the three D1 databases, seven R2 buckets, Workers AI access,
Workflows, Durable Object/Container support, Analytics Engine dataset, dispatch
namespace, email sender, custom/wildcard domains, and all secrets. Apply the
migrations before starting stateful Workers. These are prerequisites inferred
from the binding declarations, not a supported installer command.

Then a dependency-safe initial sequence is:

1. Deploy independent foundations: identity, notifications, AI router, and
   Wiki. Configure email/OAuth/Slack/AI providers as applicable.
2. Deploy deploy-runtime, then runner, then deploy-control. This specific
   ordering is documented for the Deploy-control boundary in
   `docs/architecture/platform-components.md`.
3. Deploy content-control and content after identity; deploy Slack agent after
   identity; deploy sites-edge after identity and deploy-runtime.
4. Deploy repository only after identity, notifications, Wiki and runner are
   healthy.
5. Deploy edge last, after identity, repository, content-control,
   deploy-control and content are healthy. The architecture document explicitly
   says edge is last.

There is an important bootstrap problem: runner binds deploy-control while
deploy-control binds runner. The production docs describe a special direct
Wrangler cutover and later release machinery, not a standalone way to resolve
this cycle for a new account. Thus the sequence above is a dependency-aware
starting order, **not a proven executable install procedure**. A self-hoster
would need source-level validation of Cloudflare's handling of the first
unresolved service binding or a maintainer-provided bootstrap process.

## What an operator must bring

- A Cloudflare account/plan with Workers, D1, R2, Durable Objects (including
  SQLite-backed DOs), Workflows, Workers AI, Workers Containers, dispatch
  namespaces, Analytics Engine, custom domains/routes, and email sending.
  The runner uses a `standard-4` container and a 300,000 ms CPU limit.
- DNS/zone control for a replacement primary Forge domain, a replacement
  wildcard Sites suffix, and (if Slack is enabled) a Slack endpoint subdomain.
- A Cloudflare API token scoped for the deploy-control/runner provider
  operations, plus R2 S3 credentials for the runner.
- An email domain/sender approved for invitation delivery.
- Auth configuration: Forge has its own identity Worker (JWT, PBKDF2 and
  Better Auth); it does **not** declare Clerk. Google OAuth is currently
  required by identity configuration, and passkeys are configured against the
  primary domain. Slack OAuth/application credentials are required if that
  integration is retained.
- Secret material for JWTs, invite tokens, HMAC/context tickets, encryption,
  Wiki internal calls, identity brokering, Slack signing/OAuth, and AI routing.
  Optional external AI keys are needed only for the selected OpenAI/Gemini/
  Featherless paths; Workers AI is the checked-in default.
- A deliberate replacement policy for the hosted instance's user/admin IDs,
  repository allowlists, runner deploy policies, cache/image settings, model
  budgets, and test/canary repository paths.

## Hosted-instance coupling and blockers

This is not portable as-is. Every Worker configuration includes real production
database IDs and/or `cloudforge-*` resource names, and several include direct
hosted values: `forge.smol.ai`, `*.sites.smol.ai`,
`slack.forge.smol.ai`, `invites@forge.smol.ai`, the production Cloudflare
account ID, and a hosted admin user ID. The runner additionally embeds
production deploy policies, Cloudflare resource IDs, `swyx/forge` canaries,
and a pinned Cloudflare container image/toolchain. The resource-provisioning
script is specifically for a platform preview, not general self-host setup,
and itself uses fixed `cloudforge-preview-*` names.

These are code/configuration porting tasks rather than proof that Cloudflare
cannot host another instance. The hard blockers are operational:

- no canonical fresh-account provisioning + deployment procedure;
- no supplied non-production configuration template for all 13 Workers;
- the runner/deploy-control cyclic service binding and provider-release
  bootstrap are not documented for a new installation;
- several enabled features require external service ownership (Cloudflare,
  DNS/email, Google OAuth, Slack, and optionally AI providers).

## Effort assessment and recommendation

This should be treated as a multi-week infrastructure/porting project for an
experienced Cloudflare platform engineer, not a trial deployment. The evidence
is the 13 independently released Workers, three D1 databases, seven R2 buckets,
five Worker-defined Durable Object classes, eight configured Workflows,
Containers, Workers AI, email, analytics, dispatch routing, custom domains,
and the production-only policies/credentials above. The source does not supply
enough bootstrap evidence to make a narrower, honest person-day estimate.

Recommended next step: ask Forge's maintainer for the canonical self-host
bootstrap/provisioning path and a sanitized all-Worker configuration/secret
matrix. If that does not exist, fund a separate discovery spike to parameterize
all hosted values and prove a clean Cloudflare account deployment—starting with
the runner/deploy-control bootstrap cycle—before committing to self-hosting.
