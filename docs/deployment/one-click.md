# One-click deployments

Namos Sessions can deploy its Convex backend and Vite frontend together on Cloudflare,
DigitalOcean App Platform, Netlify, Railway, or Vercel. The provider buttons automate the source
clone, build, and hosting configuration. They do not create third-party Clerk or Convex accounts.

## Before you deploy

1. Create a Clerk application and copy its publishable key and JWT issuer domain.
2. Create a Convex project with a production deployment.
3. In that Convex production deployment, set `CLERK_JWT_ISSUER_DOMAIN` to the Clerk issuer domain.
4. Generate a production Convex deploy key with `deployment:deploy` permission.
5. Keep the deploy key private. Enter it only in the hosting provider's encrypted environment
   variable form; never commit it or expose it through a `VITE_` variable.

DigitalOcean, Netlify, Railway, and Vercel ask for these two values:

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `CONVEX_DEPLOY_KEY` | Secret, build time | Selects and authorizes the adopter-owned Convex production deployment. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Public, build time | Configures Clerk in the browser application. |

Those four providers run `npm run build:hosted`. That command deploys the repository's Convex
functions, injects the selected deployment as `VITE_CONVEX_URL`, and builds the Vite application
into `dist`. Cloudflare uses the separate flow documented below.

## Provider buttons

### Cloudflare Workers

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nayamoss/namos-sessions-public)

Cloudflare deploys the Vite output as Worker static assets. Its button asks for
`VITE_CONVEX_URL` and `VITE_CLERK_PUBLISHABLE_KEY` through the checked-in Wrangler configuration.
Deploy the Convex functions to that URL before clicking the button; Cloudflare runtime secrets are
not used for the build, so the Convex deploy key is intentionally never attached to the Worker.
The checked-in configuration provides the SPA fallback. Add a custom domain after the first
deployment if desired.

> **Why `wrangler.jsonc` also ships `app.namos-sessions.xyz` as a committed route:** a
> `custom_domain: true` route only binds if the deployer owns that DNS zone in their own
> Cloudflare account — Cloudflare's zone-ownership check means a fork can't "claim" this
> domain by having it in the config, it's simply inert for anyone who doesn't own the zone.
> Given that, keeping the checked-in config matching what's actually live in production is
> the safer default: it avoids a routine maintainer deploy silently dropping the real domain
> binding. If you're touching this again, verify `app.namos-sessions.xyz` is still live
> before removing the route.

### DigitalOcean App Platform

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/nayamoss/namos-sessions-public/tree/main)

App Platform creates a static-site component from `.do/deploy.template.yaml`. Its catch-all
document is `index.html`, so direct navigation to a React Router path works.

### Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/nayamoss/namos-sessions-public)

Netlify reads `netlify.toml`, prompts for the required variables, publishes `dist`, and applies the
SPA fallback.

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnayamoss%2Fnamos-sessions-public&env=CONVEX_DEPLOY_KEY%2CVITE_CLERK_PUBLISHABLE_KEY&envDescription=Add%20a%20production%20Convex%20deploy%20key%20and%20your%20Clerk%20publishable%20key.&envLink=https%3A%2F%2Fgithub.com%2Fnayamoss%2Fnamos-sessions-public%2Fblob%2Fmain%2Fdocs%2Fdeployment%2Fone-click.md)

Vercel reads `vercel.json`, builds the Vite application, and rewrites application routes to
`index.html`.

### Railway

Railway requires a published template ID before its button can be embedded. Maintainers create the
template from `namos-sessions-public` (the public repo — `namos-sessions-webapp` stays private, so
external Railway accounts can't connect to it) using `railway.json`, require the two variables
above, enable a public domain, publish it, and then add the generated
`https://railway.com/new/template/<template-id>` button here and in the README.

## After the first deployment

1. Copy the provider's final HTTPS origin, such as `https://example.netlify.app`.
2. Add that origin and the application's sign-in/sign-up callback URLs to the Clerk production
   instance. Use the exact production origin; do not add wildcard domains unnecessarily.
3. In the Convex production deployment, set `PUBLIC_APP_ORIGIN` to that exact origin. Confirmation,
   reminder, and decision links use this value.
4. Configure optional server-side integrations in Convex. Common values include
   `EMAIL_INTEGRATION_ENCRYPTION_KEY`, `AI_INTEGRATION_ENCRYPTION_KEY`, `RESEND_API_KEY`,
   `RESEND_FROM_EMAIL`, and `OPENAI_API_KEY`. Namos-managed Operations Agent usage additionally
   requires `CLERK_SECRET_KEY`, `CLERK_AGENT_REQUIRED_FEATURE`, and
   `CLERK_AGENT_PLAN_ALLOWANCES`; set all of these as server-side Convex environment variables.
5. Redeploy after changing build-time variables. Convex runtime environment changes do not require
   rebuilding the static frontend.

## Verification

For every provider, verify:

- `/`, `/events`, `/portal`, and `/api-docs` load when opened directly and after refresh.
- Clerk sign-in returns to the deployed origin.
- The browser connects to the intended Convex deployment.
- A public CFP submission persists and reaches its success page.
- No `CONVEX_DEPLOY_KEY` value appears in `dist` or a browser response.
- `/embed/*` can be framed by the intended external site before adding restrictive frame headers.
- A push to the production branch triggers a new frontend and Convex deployment.

## Maintainer deployment

`wrangler.jsonc` ships with `app.namos-sessions.xyz` committed as a `custom_domain` route (see the
Cloudflare section above for why that's safe for forks). For every other provider, configure the
official custom domain in the provider dashboard or a private production override — don't add it
to `netlify.toml`/`vercel.json`/`railway.json`/`.do/deploy.template.yaml`, since those aren't
scoped to a single DNS zone the way a Cloudflare custom domain route is.

Local development continues to use `npx convex dev`. Do not run an unscoped `npx convex deploy`
from a locally selected project; hosted builds must always receive the intended deployment's
`CONVEX_DEPLOY_KEY`.
