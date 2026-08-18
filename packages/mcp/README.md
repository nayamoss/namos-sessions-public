# @namos-sessions/mcp

An MCP server for Namos Sessions. It runs locally over stdio and uses the same scoped REST API token as the SDK and CLI; it never connects to Convex directly.

## Setup

Create a scoped API token in Namos Sessions, then configure your MCP client. The server validates `NAMOS_SESSIONS_TOKEN` at startup and requires `NAMOS_SESSIONS_URL` to be your Convex Site URL (for example, `https://your-deployment.convex.site`).

```json
{
  "mcpServers": {
    "namos-sessions": {
      "command": "npx",
      "args": ["-y", "@namos-sessions/mcp"],
      "env": {
        "NAMOS_SESSIONS_TOKEN": "ns_live_your_scoped_token",
        "NAMOS_SESSIONS_URL": "https://your-deployment.convex.site"
      }
    }
  }
}
```

For Claude Desktop, add that `mcpServers` entry to its MCP configuration file. For Claude Code, add the same entry to `.mcp.json` at the repository root or your user MCP configuration.

The server exposes only resources and tools permitted by the token. `update_submission_status` is visible only to a token with `submissions:write`; direct calls outside that scope return the REST API's 403 `forbidden` details.
