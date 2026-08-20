import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const worker = readFileSync(join(process.cwd(), "worker/index.ts"), "utf8");
const securityHeaders = readFileSync(
  join(process.cwd(), "worker/security-headers.ts"),
  "utf8",
);

describe("security response headers", () => {
  it("enforces a strict baseline CSP and browser security headers", () => {
    expect(securityHeaders).toContain("default-src 'self'");
    expect(securityHeaders).toContain(
      '`frame-ancestors ${pathname.startsWith("/embed/") ? "*" : "\'none\'"}`',
    );
    expect(securityHeaders).toContain("script-src");
    expect(securityHeaders).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(securityHeaders).not.toContain("unsafe-eval");
    expect(worker).toContain(
      'headers.set("x-content-type-options", "nosniff")',
    );
    expect(worker).toContain(
      'headers.set("referrer-policy", "strict-origin-when-cross-origin")',
    );
    expect(worker).toContain('"permissions-policy"');
  });

  it("allows external framing only for public embeds", () => {
    expect(securityHeaders).toContain('pathname.startsWith("/embed/") ? "*"');
  });
});
