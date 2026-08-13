import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicLayout } from "@/components/PublicLayout";

describe("PublicLayout", () => {
  it("gives submission workflows enough width for participant scheduling", () => {
    const { container } = render(<PublicLayout width="submission"><p>Submission form</p></PublicLayout>);

    expect(container.querySelector("main > div")).toHaveClass("max-w-5xl");
    expect(container.querySelector("main > div")).not.toHaveClass("max-w-2xl");
  });
});
