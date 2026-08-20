import { readFile } from "node:fs/promises";

const productFiles = [
  "convex/agentRuns.ts",
  "convex/agentRuntime.ts",
  "convex/agentState.ts",
  "convex/agentData.ts",
  "convex/agentWorkflow.ts",
  "src/components/agent/AgentWorkspace.tsx",
  "src/components/agent/AgentComposer.tsx",
  "src/components/agent/AgentTimeline.tsx",
  "src/components/agent/AgentRunInspector.tsx",
];

const forbidden = [
  /\b(?:fake|mock|stub|simulate|pre-?baked)\s+(?:agent\s+)?(?:run|result|response|approval|handler)\b/i,
  /(?:return|resolve)\s+\{?\s*(?:status\s*:\s*["'](?:completed|success)["']|success\s*:\s*true)/i,
  /TODO[^\n]*(?:agent|run|approval|tool)/i,
];

const required = [
  ["convex/agentRuntime.ts", "thread.generateText"],
  ["convex/agentRuntime.ts", "internal.agentData.eventOverview"],
  ["convex/agentRuns.ts", "validateAndCreateTask"],
  ["convex/agentRuns.ts", "expectedPayloadHash"],
  ["src/components/agent/AgentWorkspace.tsx", "agentRuns.create"],
];

const sources = new Map(await Promise.all(productFiles.map(async (file) => [file, await readFile(file, "utf8")] )));
const failures = [];
for (const [file, source] of sources) {
  for (const pattern of forbidden) if (pattern.test(source)) failures.push(`${file}: forbidden stub-like product path (${pattern})`);
}
for (const [file, phrase] of required) if (!sources.get(file)?.includes(phrase)) failures.push(`${file}: missing required real-runtime path ${phrase}`);

if (failures.length) {
  console.error("Operations Agent no-stub guard failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Operations Agent no-stub guard passed.");
}
