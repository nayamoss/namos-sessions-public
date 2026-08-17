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
    expect(getByRole("button")).toHaveClass("h-10", "px-4", "text-sm");

    rerender(<Button size="sm">Filter</Button>);
    expect(getByRole("button")).toHaveClass("h-9", "px-3.5", "text-sm");
    expect(getByRole("button")).not.toHaveClass("text-xs");
  });

  it("gives form fields a normal control height and padding", () => {
    const { getByRole, rerender } = render(<Input aria-label="Name" />);
    expect(getByRole("textbox")).toHaveClass("h-10", "px-3.5", "py-2.5", "text-sm");

    rerender(<Textarea aria-label="Description" />);
    expect(getByRole("textbox")).toHaveClass("min-h-24", "px-3.5", "py-2.5", "text-sm");
  });

  it("keeps the application on the compact rem scale", () => {
    const source = readFileSync(join(process.cwd(), "src/index.css"), "utf8");
    expect(source).toContain("font-size: 80%");
    expect(source).toContain("min-height: 2.5rem");
    expect(source).not.toContain("font-size: 100%");
  });
});
