import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";
import { clerkAppearance } from "@/lib/clerk-appearance";

describe("product color system", () => {
  it("keeps primary actions electric blue and destructive actions red", () => {
    expect(buttonVariants({ variant: "accent" })).toContain("bg-primary");
    expect(buttonVariants({ variant: "accent" })).not.toContain("bg-destructive");
    expect(buttonVariants({ variant: "destructive" })).toContain("bg-destructive");
    expect(clerkAppearance.variables.colorPrimary).toBe("#0066FF");
  });

  it("defines blue primary and softened neutral surface tokens", () => {
    const css = readFileSync(join(process.cwd(), "src/index.css"), "utf8");
    expect(css).toContain("--primary: 216 100% 50%");
    expect(css).toContain("--background: 220 33% 98%");
    expect(css).toContain("--muted: 220 20% 93%");
    expect(css).toContain("--ring: 216 100% 50%");
  });

  it("does not reintroduce the old coral brand color in product source", () => {
    const files = [
      "src/index.css",
      "src/lib/clerk-appearance.ts",
      "src/pages/public/AuthSplitLayout.tsx",
      "src/emails/components/email-layout.tsx",
    ];
    for (const file of files) {
      expect(readFileSync(join(process.cwd(), file), "utf8").toLowerCase()).not.toContain("#f58e63");
    }
  });
});
