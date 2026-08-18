import { describe, expect, it, vi } from "vitest";
import { run } from "./cli.js";

const credentials = { token: "ns_live_test", baseUrl: "https://sessions.example" };

describe("namos-sessions CLI", () => {
  it("shows a friendly error before creating a client when credentials are missing", async () => {
    const stderr = vi.fn();
    const createClient = vi.fn();
    await expect(run(["events", "list"], { readCredentials: async () => undefined, createClient, stderr })).resolves.toBe(1);
    expect(stderr).toHaveBeenCalledWith("Run `namos-sessions login` first.\n");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("prints list data as a table by default and raw JSON with --json", async () => {
    const client = { events: { list: vi.fn().mockResolvedValue([{ id: "event-1", name: "Namos", status: "ACTIVE", startsAt: "2026-09-01" }]) } };
    const table = vi.fn();
    const json = vi.fn();
    await expect(run(["events", "list"], { readCredentials: async () => credentials, createClient: () => client as never, stdout: table })).resolves.toBe(0);
    await expect(run(["events", "list", "--json"], { readCredentials: async () => credentials, createClient: () => client as never, stdout: json })).resolves.toBe(0);
    expect(table).toHaveBeenCalledWith(expect.stringContaining("ID       Name"));
    expect(table).toHaveBeenCalledWith(expect.stringContaining("event-1  Namos"));
    expect(json).toHaveBeenCalledWith('[{"id":"event-1","name":"Namos","status":"ACTIVE","startsAt":"2026-09-01"}]\n');
  });

  it("accepts login flags and never writes the token to output", async () => {
    const writeCredentials = vi.fn();
    const stdout = vi.fn();
    await expect(run(["login", "--token", "ns_live_secret", "--url", "https://sessions.example"], { writeCredentials, stdout })).resolves.toBe(0);
    expect(writeCredentials).toHaveBeenCalledWith({ token: "ns_live_secret", baseUrl: "https://sessions.example" });
    expect(stdout).toHaveBeenCalledWith("Credentials saved.\n");
    expect(stdout).not.toHaveBeenCalledWith(expect.stringContaining("ns_live_secret"));
  });
});
