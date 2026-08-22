// @vitest-environment node
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./security-headers";

const environment = {
  VITE_CONVEX_URL: "https://wandering-squid-391.convex.cloud",
  CONVEX_SITE_URL: "https://wandering-squid-391.convex.site",
  VITE_PUBLIC_EMBED_ORIGIN: "https://namos-sessions-webapp.namos-sessions-marketing.workers.dev",
};

describe("Worker content security policy", () => {
  it("derives HTTPS and websocket origins from the configured Convex deployment", () => {
    const policy = contentSecurityPolicy(environment, "/demo/proof");
    expect(policy).toContain("https://wandering-squid-391.convex.cloud");
    expect(policy).toContain("wss://wandering-squid-391.convex.cloud");
    expect(policy).toContain("https://wandering-squid-391.convex.site");
    expect(policy).not.toContain("drifting-otter-204");
    expect(policy).toContain("frame-src 'self' https://namos-sessions-webapp.namos-sessions-marketing.workers.dev");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("keeps only public embeds frameable", () => {
    expect(contentSecurityPolicy(environment, "/embed/schedule")).toContain("frame-ancestors *");
  });

  it("rejects non-HTTPS Convex origins", () => {
    expect(() => contentSecurityPolicy({ ...environment, VITE_CONVEX_URL: "http://localhost:3210" }, "/")).toThrow(
      "Convex production origins must use HTTPS.",
    );
  });
});
