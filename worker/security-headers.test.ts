import { describe, expect, it } from "vitest";
import { createContentSecurityPolicy } from "./security-headers";

const clerkFrontendHost = "prepared-raven-42.clerk.accounts.dev";
const publishableKey = `pk_test_${btoa(`${clerkFrontendHost}$`)}`;

describe("createContentSecurityPolicy", () => {
  it("allows the configured Clerk and Convex origins", () => {
    const policy = createContentSecurityPolicy(
      {
        VITE_CLERK_PUBLISHABLE_KEY: publishableKey,
        VITE_CONVEX_URL: "https://wandering-squid-391.convex.cloud",
        CONVEX_SITE_URL: "https://wandering-squid-391.convex.site",
      },
      "/dashboard",
    );

    expect(policy).toContain(`https://${clerkFrontendHost}`);
    expect(policy).toContain("https://wandering-squid-391.convex.cloud");
    expect(policy).toContain("wss://wandering-squid-391.convex.cloud");
    expect(policy).toContain("https://wandering-squid-391.convex.site");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("rejects placeholders and untrusted service origins", () => {
    const policy = createContentSecurityPolicy(
      {
        VITE_CLERK_PUBLISHABLE_KEY: "pk_test_your-clerk-publishable-key",
        VITE_CONVEX_URL: "https://attacker.example/convex.cloud",
        CONVEX_SITE_URL: "https://your-project.convex.site",
      },
      "/",
    );

    expect(policy).not.toContain("your-project");
    expect(policy).not.toContain("your-clerk-publishable-key");
    expect(policy).not.toContain("attacker.example");
    expect(policy).toContain("connect-src 'self'");
  });

  it("keeps embeds frameable without relaxing other pages", () => {
    const config = {
      VITE_CLERK_PUBLISHABLE_KEY: publishableKey,
      VITE_CONVEX_URL: "https://wandering-squid-391.convex.cloud",
      CONVEX_SITE_URL: "https://wandering-squid-391.convex.site",
    };

    expect(createContentSecurityPolicy(config, "/embed/agenda")).toContain(
      "frame-ancestors *",
    );
    expect(createContentSecurityPolicy(config, "/events/demo")).toContain(
      "frame-ancestors 'none'",
    );
  });
});
