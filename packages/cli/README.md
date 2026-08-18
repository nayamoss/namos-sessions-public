# @namos-sessions/cli

Command-line access to the Namos Sessions REST API, powered by `@namos-sessions/sdk`.

## Install

```sh
npm install -g @namos-sessions/cli
# or run without installing
npx @namos-sessions/cli events list
```

## Authenticate

Save an API token and Convex Site URL locally:

```sh
namos-sessions login
```

Credentials are stored in `~/.config/namos-sessions/credentials` with `0600` permissions. The token is never displayed after login. For non-interactive use, provide `--token` and `--url`, or set `NAMOS_SESSIONS_TOKEN` and `NAMOS_SESSIONS_URL`. Flags and environment variables override stored credentials.

```sh
namos-sessions login --token "$NAMOS_SESSIONS_TOKEN" --url https://your-deployment.convex.site
```

Every authenticated command requires credentials. Without them, it prints `Run \`namos-sessions login\` first.`

## Commands

Lists print a readable table by default. Add `--json` to print the raw JSON array.

```sh
namos-sessions events list [--json]
namos-sessions submissions list --event <event-id> [--json]
namos-sessions agenda list --event <event-id> [--json]
namos-sessions tasks list --event <event-id> [--json]
```

Token-management endpoints require an organizer Clerk session token, rather than a scoped API token. Each token belongs to one event.

```sh
namos-sessions tokens create --event <event-id> --label "CI integration" --scopes events:read,agenda:read
namos-sessions tokens list --event <event-id> [--json]
namos-sessions tokens revoke --event <event-id> --id <token-id>
```

`tokens create` displays the newly created API token once, so save it immediately.
