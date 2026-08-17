import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Keep route registration from growing a second hand-rolled token-auth path. Session token
// management and CORS preflight routes are intentionally exempt: neither accepts API tokens.
//
// Convex's httpRouter has no Express-style ":id" dynamic-segment syntax — only exact `path`
// and trailing-slash `pathPrefix` matching (verified against convex/server's own source,
// 2026-08-16, after discovering a real bug: a literal `path: "/api/v1/submissions/:id/status"`
// matches only that literal string and never a real request). The dynamic-id routes below use
// `pathPrefix`, not `path`, so they're checked separately from the exact-path routes.
describe("public API route registration", () => {
  it("keeps single-line bearer-token routes behind withApiAuth", async () => {
    const source = await readFile(path.resolve(process.cwd(), "convex/http.ts"), "utf8");
    const registration = source.slice(source.indexOf(`path: "/api/v1/events"`), source.indexOf("});", source.indexOf(`path: "/api/v1/events"`)));
    expect(registration).toContain("withApiAuth");
  });

  it("keeps the pathPrefix-based submissions status write route behind withApiAuth", async () => {
    const source = await readFile(path.resolve(process.cwd(), "convex/http.ts"), "utf8");
    const start = source.indexOf(`pathPrefix: "/api/v1/submissions/", method: "POST"`);
    expect(start).toBeGreaterThan(-1);
    const registration = source.slice(start, source.indexOf("})) });", start));
    expect(registration).toContain("withApiAuth");
    expect(registration).not.toContain("path:");
  });

  it("keeps the shared list-route loop behind withApiAuth for every listed path", async () => {
    const source = await readFile(path.resolve(process.cwd(), "convex/http.ts"), "utf8");
    const loopStart = source.indexOf("for (const [path, scope, operation, fn] of [");
    expect(loopStart).toBeGreaterThan(-1);
    const loopBody = source.slice(loopStart, source.indexOf("] as const)", loopStart));
    for (const route of ["/api/v1/submissions", "/api/v1/speakers", "/api/v1/agenda", "/api/v1/tasks"]) {
      expect(loopBody).toContain(`"${route}"`);
    }
    const loopHandler = source.slice(source.indexOf("] as const)", loopStart), source.indexOf("\n\n", source.indexOf("] as const)", loopStart)));
    expect(loopHandler).toContain("withApiAuth");
  });

  it("keeps token-management routes on the organizer-session path, never accepting a bearer API token", async () => {
    const source = await readFile(path.resolve(process.cwd(), "convex/http.ts"), "utf8");
    const exactMatches = [...source.matchAll(/path: "\/api\/v1\/tokens"[^}]*\}\)/g)];
    expect(exactMatches.length).toBeGreaterThan(0);
    for (const match of exactMatches) expect(match[0]).toContain("withOrganizerSession");

    const prefixStart = source.indexOf(`pathPrefix: "/api/v1/tokens/", method: "DELETE"`);
    expect(prefixStart).toBeGreaterThan(-1);
    const prefixRegistration = source.slice(prefixStart, source.indexOf("})) });", prefixStart));
    expect(prefixRegistration).toContain("withOrganizerSession");
  });
});
