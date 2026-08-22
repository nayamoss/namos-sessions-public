import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const worker = readFileSync(join(process.cwd(), "worker/index.ts"), "utf8");
const csp = readFileSync(join(process.cwd(), "worker/security-headers.ts"), "utf8");

describe("security response headers", () => {
  it("enforces a strict baseline CSP and browser security headers", () => {
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors ${pathname.startsWith(\"/embed/\") ? \"*\" : \"'none'\"}");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("VITE_PUBLIC_EMBED_ORIGIN");
    expect(csp).toContain("CLERK_FRONTEND_API_URL");
    expect(csp).toContain("PUBLIC_EMBED_ORIGIN");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("unsafe-eval");
    expect(worker).toContain('headers.set("x-content-type-options", "nosniff")');
    expect(worker).toContain('headers.set("referrer-policy", "strict-origin-when-cross-origin")');
    expect(worker).toContain('headers.set("permissions-policy"');
  });

  it("allows external framing only for public embeds", () => {
    expect(csp).toContain('pathname.startsWith("/embed/") ? "*"');
  });
});
