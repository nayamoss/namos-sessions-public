import { NamosSessionsClient, type ApiScope } from "@namos-sessions/sdk";
import { readCredentials, writeCredentials, type Credentials } from "./credentials.js";
import { formatTable, type TableColumn } from "./format.js";

type Client = Pick<NamosSessionsClient, "events" | "submissions" | "agenda" | "tasks" | "tokens">;
type Flags = Record<string, string | boolean>;
export interface CliDependencies {
  env?: NodeJS.ProcessEnv;
  readCredentials?: () => Promise<Credentials | undefined>;
  writeCredentials?: (credentials: Credentials) => Promise<void>;
  prompt?: (message: string, hidden?: boolean) => Promise<string>;
  createClient?: (credentials: Credentials) => Client;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

const help = `Usage: namos-sessions <command> [options]

Commands:
  login
  events list [--json]
  submissions list --event <id> [--json]
  agenda list --event <id> [--json]
  tasks list --event <id> [--json]
  tokens create --event <id> --label <label> --scopes <scope,...>
  tokens list --event <id> [--json]
  tokens revoke --event <id> --id <token-id>
`;

export async function run(argv: string[], dependencies: CliDependencies = {}): Promise<number> {
  const env = dependencies.env ?? process.env;
  const stdout = dependencies.stdout ?? ((text) => process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text) => process.stderr.write(text));
  const [group, action, ...rest] = argv;
  const flags = parseFlags(group === "login" ? [action, ...rest].filter((argument): argument is string => Boolean(argument)) : rest);
  if (!group || group === "--help" || group === "-h" || group === "help") { stdout(help); return 0; }
  if (group === "login") return login(flags, { env, stdout, stderr, ...dependencies });

  const credentials = await resolveCredentials(flags, env, dependencies.readCredentials ?? readCredentials);
  if (!credentials) { stderr("Run `namos-sessions login` first.\n"); return 1; }
  const client = (dependencies.createClient ?? ((input) => new NamosSessionsClient(input)))(credentials);
  try {
    if (group === "events" && action === "list") return outputList(await client.events.list(), flags, eventColumns, stdout);
    if (group === "submissions" && action === "list") return outputList(await client.submissions.list(required(flags, "event")), flags, submissionColumns, stdout);
    if (group === "agenda" && action === "list") return outputList(await client.agenda.list(required(flags, "event")), flags, agendaColumns, stdout);
    if (group === "tasks" && action === "list") return outputList(await client.tasks.list(required(flags, "event")), flags, taskColumns, stdout);
    if (group === "tokens" && action === "list") return outputList(await client.tokens.list(required(flags, "event")), flags, tokenColumns, stdout);
    if (group === "tokens" && action === "create") {
      const created = await client.tokens.create({ eventId: required(flags, "event"), label: required(flags, "label"), scopes: parseScopes(required(flags, "scopes")) });
      stdout(`Token created. Save this token now; it will not be shown again:\n${created.token}\n`);
      return 0;
    }
    if (group === "tokens" && action === "revoke") {
      await client.tokens.revoke(required(flags, "event"), required(flags, "id"));
      stdout("Token revoked.\n"); return 0;
    }
    stderr(`Unknown command.\n\n${help}`); return 1;
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : "Command failed."}\n`); return 1;
  }
}

async function login(flags: Flags, dependencies: Required<Pick<CliDependencies, "env" | "stdout" | "stderr">> & CliDependencies): Promise<number> {
  const token = value(flags, "token") ?? dependencies.env.NAMOS_SESSIONS_TOKEN ?? await (dependencies.prompt ?? prompt)("API token: ", true);
  const baseUrl = value(flags, "url") ?? dependencies.env.NAMOS_SESSIONS_URL ?? await (dependencies.prompt ?? prompt)("Base URL (for example https://example.convex.site): ");
  if (!token || !baseUrl) { dependencies.stderr("Both a token and base URL are required.\n"); return 1; }
  try { new URL(baseUrl); } catch { dependencies.stderr("Base URL must be a valid URL.\n"); return 1; }
  await (dependencies.writeCredentials ?? writeCredentials)({ token, baseUrl });
  dependencies.stdout("Credentials saved.\n"); return 0;
}

async function resolveCredentials(flags: Flags, env: NodeJS.ProcessEnv, load: () => Promise<Credentials | undefined>): Promise<Credentials | undefined> {
  const stored = await load();
  const token = value(flags, "token") ?? env.NAMOS_SESSIONS_TOKEN ?? stored?.token;
  const baseUrl = value(flags, "url") ?? env.NAMOS_SESSIONS_URL ?? stored?.baseUrl;
  return token && baseUrl ? { token, baseUrl } : undefined;
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) continue;
    const [name, inline] = argument.slice(2).split("=", 2);
    if (inline !== undefined) flags[name] = inline;
    else if (args[index + 1] && !args[index + 1].startsWith("--")) flags[name] = args[++index];
    else flags[name] = true;
  }
  return flags;
}
function value(flags: Flags, name: string): string | undefined { const result = flags[name]; return typeof result === "string" ? result : undefined; }
function required(flags: Flags, name: string): string { const result = value(flags, name); if (!result) throw new Error(`--${name} is required.`); return result; }
function parseScopes(input: string): ApiScope[] { const scopes = input.split(",").map((scope) => scope.trim()).filter(Boolean); if (!scopes.length) throw new Error("--scopes must include at least one scope."); return scopes as ApiScope[]; }
function outputList(rows: object[], flags: Flags, columns: TableColumn[], stdout: (text: string) => void): number { stdout(flags.json === true ? `${JSON.stringify(rows)}\n` : formatTable(rows, columns)); return 0; }

async function prompt(message: string, hidden = false): Promise<string> {
  if (hidden && process.stdin.isTTY) {
    process.stdout.write(message);
    return await new Promise<string>((resolve) => {
      let input = "";
      process.stdin.setRawMode(true); process.stdin.resume();
      const onData = (chunk: Buffer) => {
        const character = chunk.toString();
        if (character === "\r" || character === "\n") { process.stdin.off("data", onData); process.stdin.setRawMode(false); process.stdout.write("\n"); resolve(input); }
        else if (character === "\u0003") { process.stdin.off("data", onData); process.stdin.setRawMode(false); resolve(""); }
        else if (character === "\u007f") input = input.slice(0, -1);
        else input += character;
      };
      process.stdin.on("data", onData);
    });
  }
  const { createInterface } = await import("node:readline/promises");
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try { return await readline.question(message); } finally { readline.close(); }
}

const eventColumns: TableColumn[] = [{ header: "ID", value: (row) => row.id }, { header: "Name", value: (row) => row.name }, { header: "Status", value: (row) => row.status }, { header: "Starts at", value: (row) => row.startsAt }];
const submissionColumns: TableColumn[] = [{ header: "ID", value: (row) => row._id }, { header: "Title", value: (row) => row.title }, { header: "Status", value: (row) => row.status }];
const agendaColumns: TableColumn[] = [{ header: "ID", value: (row) => row._id }, { header: "Title", value: (row) => row.title }, { header: "Start", value: (row) => row.startTime }, { header: "End", value: (row) => row.endTime }];
const taskColumns: TableColumn[] = [{ header: "ID", value: (row) => row._id }, { header: "Title", value: (row) => row.title }, { header: "Status", value: (row) => row.status }, { header: "Due", value: (row) => row.dueDate }];
const tokenColumns: TableColumn[] = [{ header: "ID", value: (row) => row._id }, { header: "Label", value: (row) => row.label }, { header: "Prefix", value: (row) => row.keyPrefix }, { header: "Scopes", value: (row) => row.scopes }, { header: "Last used", value: (row) => row.lastUsedAt }];
