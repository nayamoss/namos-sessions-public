#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServerFromEnvironment } from "./server.js";

try {
  const server = await createServerFromEnvironment();
  await server.connect(new StdioServerTransport());
} catch (error) {
  process.stderr.write(`namos-sessions-mcp: ${error instanceof Error ? error.message : "Unable to start."}\n`);
  process.exitCode = 1;
}
