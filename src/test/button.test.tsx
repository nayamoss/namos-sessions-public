import { render } from "@testing-library/react";
import { Download } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";

describe("icon buttons", () => {
  it("uses its accessible name as the hover label", () => {
    const { getByRole } = render(
      <Button size="icon" aria-label="Export CSV">
        <Download />
      </Button>,
    );

    expect(getByRole("button", { name: "Export CSV" })).toHaveAttribute(
      "title",
      "Export CSV",
    );
  });
});
