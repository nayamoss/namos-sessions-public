import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PortalFormEditor, PortalFormsEmptyState } from "@/pages/portal/PortalForms";
import type { Event } from "@/data/types";

const event = {
  id: "event-a",
  name: "Portal Summit",
  slug: "portal-summit",
  timezone: "UTC",
  startDate: 1_760_000_000_000,
  endDate: 1_760_200_000_000,
  accentColor: "#7c3aed",
} as Event;

const form = {
  name: "Sponsor details",
  title: "Tell us about your organization",
  kind: "group" as const,
  fields: [
    { id: "company", recordId: "company", label: "Company", type: "text" as const, required: true },
    { id: "tier", recordId: "tier", label: "Tier", type: "select" as const, required: false, options: ["Gold", "Silver"] },
  ],
  pages: [
    { id: "organization", kind: "custom" as const, label: "Organization", pageHeading: "Organization", fieldIds: ["company", "tier"] },
    { id: "contacts", kind: "custom" as const, label: "Contacts", pageHeading: "Contacts", fieldIds: [] },
  ],
  sectionTitle: "Organization",
  instructions: "",
  sendConfirmationEmail: true,
  confirmationBody: "<p>Thanks.</p>",
  version: 1,
};

describe("Portal form builder", () => {
  it("offers templates and a blank form from the first-use empty state", () => {
    const onChooseTemplate = vi.fn();
    const onStartBlank = vi.fn();
    render(
      <PortalFormsEmptyState
        onChooseTemplate={onChooseTemplate}
        onStartBlank={onStartBlank}
      />,
    );

    expect(screen.getByText("Create your first portal form")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose a template" }));
    fireEvent.click(screen.getByRole("button", { name: "Start blank" }));
    expect(onChooseTemplate).toHaveBeenCalledOnce();
    expect(onStartBlank).toHaveBeenCalledOnce();
  });

  it("uses organizer-owned pages, a focused inspector, and dedicated preview mode", async () => {
    const onSave = vi.fn();
    const { container } = render(
      <PortalFormEditor
        form={form}
        event={event}
        library={[]}
        saving={false}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    const rail = screen.getByRole("navigation", { name: "Form pages" });
    expect(within(rail).getByText("Organization")).toBeInTheDocument();
    expect(within(rail).getByText("Contacts")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Call for proposals preview" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Company" }));
    const label = screen.getByLabelText("Label");
    fireEvent.change(label, { target: { value: "Organization name" } });
    expect(screen.getByRole("button", { name: "Edit Organization name" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add page" }));
    expect(within(rail).getByText("New page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const preview = screen.getByRole("region", { name: "Call for proposals preview" });
    expect(preview).toBeInTheDocument();
    expect(container.querySelector('[style*="--primary"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to editor" })).toBeInTheDocument();
  });

  it("clones page fields independently", async () => {
    const onSave = vi.fn();
    render(<PortalFormEditor form={form} event={event} library={[]} saving={false} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Organization" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    expect(screen.getAllByText("Organization copy").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Edit Company" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const saved = onSave.mock.calls[0][0];
    expect(saved.pages[0].fieldIds).not.toEqual(saved.pages[2].fieldIds);
    expect(new Set(saved.fields.map((field: { id: string }) => field.id)).size).toBe(saved.fields.length);
  });
});
