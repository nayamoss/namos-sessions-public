import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const worker = readFileSync(join(process.cwd(), "worker/index.ts"), "utf8");

describe("security response headers", () => {
  it("enforces a strict baseline CSP and browser security headers", () => {
    expect(worker).toContain("default-src 'self'");
    expect(worker).toContain("frame-ancestors ${pathname.startsWith(\"/embed/\") ? \"*\" : \"'none'\"}");
    expect(worker).toContain("script-src 'self'");
    expect(worker).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(worker).not.toContain("unsafe-eval");
    expect(worker).toContain('headers.set("x-content-type-options", "nosniff")');
    expect(worker).toContain('headers.set("referrer-policy", "strict-origin-when-cross-origin")');
    expect(worker).toContain('headers.set("permissions-policy"');
  });

  it("allows external framing only for public embeds", () => {
    expect(worker).toContain('pathname.startsWith("/embed/") ? "*"');
  });
});
