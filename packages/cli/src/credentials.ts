import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Credentials { token: string; baseUrl: string; }
export const credentialsPath = (home = homedir()) => join(home, ".config", "namos-sessions", "credentials");

export async function readCredentials(path = credentialsPath()): Promise<Credentials | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isCredentials(parsed)) return undefined;
    return parsed;
  } catch { return undefined; }
}

export async function writeCredentials(credentials: Credentials, path = credentialsPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(credentials)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

function isCredentials(value: unknown): value is Credentials {
  return typeof value === "object" && value !== null && typeof (value as Credentials).token === "string" && typeof (value as Credentials).baseUrl === "string";
}
