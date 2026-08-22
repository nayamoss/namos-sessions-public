// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { routeRequest } from "./request-router";

describe("request router", () => {
  it.each(["GET", "HEAD"])("serves /index.html directly for %s", async (method) => {
    const assetFetch = vi.fn(async (request: Request) => new Response(method === "HEAD" ? null : "<!doctype html>", { status: 200 }));
    const response = await routeRequest(new Request("https://app.example.test/index.html?ignored=1", { method }), { ASSETS: { fetch: assetFetch } } as unknown as Env);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(new URL((assetFetch.mock.calls[0]?.[0] as Request).url).pathname).toBe("/");
  });
});
