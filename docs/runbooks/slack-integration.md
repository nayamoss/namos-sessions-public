# Slack integration deployment runbook

The Slack adapter is installed once per Namos organization and bound to one channel per event. Slack is not an authorization source: organizers explicitly link their Slack account and every operation rechecks current event access.

## Configure the Slack app

1. Create an app from `slack-manifest.example.yaml` in the target sandbox workspace.
2. Replace only `YOUR-CONVEX-DEPLOYMENT` with the deployed Convex Site hostname. Keep the OAuth redirect, Events API, slash-command, and interactivity paths exact.
3. Confirm the bot scopes and subscriptions match the manifest. Do not add channel-history or user-email scopes.
4. Copy the client ID, client secret, and signing secret from Slack. Generate a distinct encryption key with `openssl rand -base64 32`.
5. Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_INTEGRATION_ENCRYPTION_KEY`, `CONVEX_SITE_URL`, and `PUBLIC_APP_ORIGIN` with `npx convex env set` against the intended deployment. Never use `VITE_` names for secrets.
6. Deploy the Convex schema/functions through the repository's guarded `npm run convex:deploy` workflow before enabling Slack request URLs.

## Install and bind

From an event, open Settings → Integrations → Slack. An organization owner/admin completes OAuth. Any organizer for that event can then choose a visible channel, enable the Operations Agent and/or selected notification kinds, and save. Invite `@Namos` to a private channel before trying to bind it.

Reinstalling the same team for the same organization replaces the encrypted token without exposing it to the browser. If Slack rotates or revokes a token, reinstall the app. A permanent Slack authentication or channel error appears as “Needs attention”.

Removing Slack from an event deletes only that event's channel binding. Disconnecting the workspace is owner/admin-only, attempts `auth.revoke`, and removes all organization bindings, mappings, thread projections, and queued deliveries.

## Sandbox verification

Verify real OAuth and stored workspace metadata; confirm the token is an AES-256-GCM envelope and OAuth state is consumed. Exercise `/namos help`, `/namos status`, `/namos ask`, an `@Namos` mention, a DM with ambiguous event scope, explicit account linking, a thread reply, task approval/rejection, all five notification kinds, Send test, a public channel, an invited private channel, channel removal, and disconnect.

Send duplicate signed deliveries and confirm one receipt/run/message. Send a forged signature and timestamps outside the five-minute window and confirm `401` with no receipt. Capture acknowledgement latency separately from scheduled processing; normal Slack requests must acknowledge within three seconds and should remain below 2.5 seconds at p95.

Slack and the web app deploy separately. Local checks or a frontend deploy do not prove the Slack integration is live until the target Convex endpoints, environment values, and sandbox journeys above pass.
