# @namos-sessions/sdk

Typed, dependency-free TypeScript client for the Namos Sessions REST API.

## Install

```sh
npm install @namos-sessions/sdk
```

## Quickstart

```ts
import { NamosSessionsClient } from "@namos-sessions/sdk";

const client = new NamosSessionsClient({
  token: process.env.NAMOS_SESSIONS_TOKEN!,
  // Your Convex Site URL, not the .convex.cloud deployment URL.
  baseUrl: "https://your-deployment.convex.site",
});

const events = await client.events.list();
const submissions = await client.submissions.list(events[0].id);

await client.submissions.updateStatus(submissions[0]._id, "accepted", {
  idempotencyKey: crypto.randomUUID(),
});
```

The read methods use scoped API tokens. Token management endpoints require an organizer Clerk
session token, because API tokens cannot mint, list, or revoke API tokens.

All non-2xx responses throw `NamosSessionsApiError`, which includes `status`, `code`, `message`,
and `details` from the REST error response.
