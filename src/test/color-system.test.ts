import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";
import { clerkAppearance } from "@/lib/clerk-appearance";

describe("product color system", () => {
  it("keeps primary actions electric blue and destructive actions red", () => {
    const accentButton = buttonVariants({ variant: "accent" });
    const css = readFileSync(join(process.cwd(), "src/index.css"), "utf8");

    expect(accentButton).toContain("bg-primary");
    expect(accentButton).toContain("hover:bg-[hsl(var(--primary-hover))]");
    expect(accentButton).not.toContain("bg-destructive");
    expect(buttonVariants({ variant: "destructive" })).toContain("bg-destructive");
    expect(css).toMatch(/:root[\s\S]*?--primary: 216 100% 50%/);
    expect(css).toMatch(/\.dark[\s\S]*?--primary: 216 100% 65%/);
    expect(clerkAppearance.variables.colorPrimary).toBe("#0066FF");
  });

  // Asserts the invariant rather than literal values: fill tokens that sit on
  // the page background must not equal it. When --muted matched --background,
  // the header search button, badges and switch thumbs rendered invisible (#171).
  it("keeps fill tokens distinct from the surfaces they sit on", () => {
    // Comments are stripped first: prose explaining these tokens necessarily
    // names them, and would otherwise be read as a declaration.
    const css = readFileSync(join(process.cwd(), "src/index.css"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const light = css.slice(css.indexOf(":root"), css.indexOf(".dark"));
    const dark = css.slice(css.indexOf(".dark"));

    const token = (scope: string, name: string) => {
      const match = new RegExp(`^[ \\t]*--${name}:[ \\t]*([^;]+);`, "m").exec(scope);
      if (!match) throw new Error(`--${name} is not defined`);
      return match[1].trim();
    };

    for (const [label, scope] of [["light", light], ["dark", dark]] as const) {
      const background = token(scope, "background");
      for (const fill of ["muted", "secondary", "surface-sunken"]) {
        // surface-sunken is light-mode only; skip where it is not declared.
        if (!new RegExp(`--${fill}:`).test(scope)) continue;
        expect(token(scope, fill), `--${fill} must differ from --background in ${label} mode`)
          .not.toBe(background);
      }
      expect(token(scope, "card"), `--card must differ from --background in ${label} mode`)
        .not.toBe(background);
    }
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
