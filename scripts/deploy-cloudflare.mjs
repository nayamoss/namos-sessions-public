import { spawnSync } from "node:child_process";
import { readWranglerConfig, requiredWranglerVars, validateWranglerConfig } from "./lib/validate-wrangler-config.mjs";

const config = readWranglerConfig();
const buildEnvironment = { ...process.env };

// `npm run build` bundles the working tree, not a commit. Several agents and
// sessions share this checkout, so a deploy run while someone else has edits in
// flight ships their half-finished work to production — that has happened.
// Refuse on a dirty tree. There is deliberately no override: an escape hatch
// is the thing that gets reached for at exactly the wrong moment.
function assertCleanTree() {
  const status = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  // Not a git checkout, or git unavailable: nothing to verify, carry on.
  if (status.error || status.status !== 0) return;

  const dirty = status.stdout.split("\n").filter((line) => line.trim() !== "");
  if (dirty.length === 0) return;

  console.error(
    `Refusing to deploy: ${dirty.length} uncommitted change(s) in the working tree.\n` +
      "The build bundles the working tree, so this would ship whatever is currently\n" +
      "checked out — including edits belonging to another session.\n",
  );
  for (const line of dirty.slice(0, 15)) console.error(`  ${line}`);
  if (dirty.length > 15) console.error(`  …and ${dirty.length - 15} more`);
  console.error(
    "\nCommit or stash first, or deploy from a clean checkout:\n" +
      "  git worktree add --detach /tmp/deploy origin/main",
  );
  process.exit(1);
}

assertCleanTree();

validateWranglerConfig(config);

for (const name of requiredWranglerVars) buildEnvironment[name] = process.env[name] || config.vars[name];
for (const [name, value] of Object.entries(config.vars)) {
  if (name.startsWith("VITE_") && !buildEnvironment[name]) buildEnvironment[name] = value;
}
const deployedCommit = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
if (deployedCommit.status !== 0 || !deployedCommit.stdout.trim()) {
  console.error("Refusing to deploy: the exact source commit could not be determined.");
  process.exit(1);
}
buildEnvironment.VITE_DEMO_DEPLOY_COMMIT = deployedCommit.stdout.trim();
buildEnvironment.VITE_DEMO_VERIFIED_AT = new Date().toISOString();

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { env, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npm", ["run", "build"], buildEnvironment);
run("wrangler", ["deploy", ...process.argv.slice(2)]);
