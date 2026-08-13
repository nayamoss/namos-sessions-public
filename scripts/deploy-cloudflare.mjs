import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const required = ["VITE_CONVEX_URL", "VITE_CLERK_PUBLISHABLE_KEY"];
const placeholders = ["your-project", "your-clerk-publishable-key"];
const buildEnvironment = { ...process.env };

for (const name of required) {
  const value = process.env[name] || config.vars?.[name];
  if (typeof value !== "string" || !value || placeholders.some((part) => value.includes(part))) {
    console.error(`Configure ${name} in wrangler.jsonc before deploying to Cloudflare.`);
    process.exit(1);
  }
  buildEnvironment[name] = value;
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { env, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npm", ["run", "build"], buildEnvironment);
run("wrangler", ["deploy", ...process.argv.slice(2)]);
