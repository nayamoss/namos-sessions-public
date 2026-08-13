import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DynamicFormRenderer, type DynamicField } from "@/components/shared/DynamicFormRenderer";

const fields: DynamicField[] = [
  { id: "format", label: "Format", type: "select", options: ["Talk", "Workshop"] },
  { id: "workshopLength", label: "Workshop length", type: "number", showIf: { fieldId: "format", equals: "Workshop" } },
];

function ConditionalForm() {
  const [values, setValues] = useState<Record<string, string>>({});
  return <DynamicFormRenderer fields={fields} values={values} onChange={(fieldId, value) => setValues((current) => ({ ...current, [fieldId]: value }))} />;
}

describe("DynamicFormRenderer conditional fields", () => {
  it("hides and shows a field live when its controlling answer changes", async () => {
    render(<ConditionalForm />);

    expect(screen.queryByLabelText("Workshop length")).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Format" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Workshop" }));
    expect(screen.getByLabelText("Workshop length")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Format" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Talk" }));
    expect(screen.queryByLabelText("Workshop length")).not.toBeInTheDocument();
  });
});
