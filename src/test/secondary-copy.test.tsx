import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormField } from "@/components/shared/FormField";
import { SectionCard } from "@/components/shared/SectionCard";
import { ToggleField } from "@/components/shared/ToggleField";
import { Input } from "@/components/ui/input";

describe("secondary copy", () => {
  it("does not render optional helper copy in shared fields", () => {
    render(
      <>
        <FormField label="Plan name" hint="Visible to reviewers">
          <Input />
        </FormField>
        <ToggleField
          checked={false}
          hint="Only unresolved assignments receive reminders."
          label="Send reminders"
          onCheckedChange={() => undefined}
        />
      </>,
    );

    expect(screen.queryByText("Visible to reviewers")).not.toBeInTheDocument();
    expect(screen.queryByText("Only unresolved assignments receive reminders.")).not.toBeInTheDocument();
  });

  it("does not render optional section descriptions", () => {
    render(
      <SectionCard description="A secondary explanation" title="Review settings">
        <div>Content</div>
      </SectionCard>,
    );

    expect(screen.getByRole("heading", { name: "Review settings" })).toBeVisible();
    expect(screen.queryByText("A secondary explanation")).not.toBeInTheDocument();
  });
});
