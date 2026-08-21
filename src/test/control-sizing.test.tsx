import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("shared control sizing", () => {
  it("keeps regular and compact buttons readable", () => {
    const { getByRole, rerender } = render(<Button>Continue</Button>);
    expect(getByRole("button")).toHaveClass("h-8", "px-3.5", "text-sm");

    rerender(<Button size="sm">Filter</Button>);
    expect(getByRole("button")).toHaveClass("h-7", "px-3", "text-sm");
    expect(getByRole("button")).not.toHaveClass("text-xs");
  });

  it("gives form fields a normal control height and padding", () => {
    const { getByRole, rerender } = render(<Input aria-label="Name" />);
    expect(getByRole("textbox")).toHaveClass("h-8", "px-3", "py-1.5", "text-sm");

    rerender(<Textarea aria-label="Description" />);
    expect(getByRole("textbox")).toHaveClass("min-h-20", "px-3", "py-1.5", "text-sm");
  });

  it("uses the compact application density scale", () => {
    const source = readFileSync(join(process.cwd(), "src/index.css"), "utf8");
    expect(source).toContain("font-size: 87.5%");
    expect(source).toContain("min-height: 2rem");
    expect(source).not.toContain("font-size: 80%");
    expect(source).toContain("--text-base: 1rem");
    expect(source).toContain('[role="combobox"]');
  });

  it("keeps onboarding at a normal form width", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/onboarding/OnboardingWizard.tsx"), "utf8");
    expect(source.match(/max-w-2xl/g)).toHaveLength(2);
    expect(source).not.toContain("max-w-lg");
    expect(source).not.toContain("Takes 30 seconds");
    expect(source).not.toContain("Helps us set things up right for you");
    expect(source).not.toContain("Press <kbd");
  });

  it("keeps public submission forms wide and surfaces their keyboard navigation", () => {
    const publicForm = readFileSync(join(process.cwd(), "src/pages/public/PublicFormRenderer.tsx"), "utf8");
    const submissionPage = readFileSync(join(process.cwd(), "src/pages/public/SubmissionPage.tsx"), "utf8");
    const wizard = readFileSync(join(process.cwd(), "src/components/shared/WizardShell.tsx"), "utf8");
    expect(publicForm).not.toContain("max-w-lg");
    expect(submissionPage).not.toContain("max-w-lg");
    expect(publicForm).toContain("max-w-2xl");
    expect(publicForm).toContain("⌘");
    expect(wizard).toContain("Keyboard shortcuts:");
    expect(wizard).toContain("(!event.metaKey && !event.ctrlKey)");
  });
});
