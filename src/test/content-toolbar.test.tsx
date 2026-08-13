import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ContentToolbar } from "@/components/shared/ContentToolbar";

describe("ContentToolbar", () => {
  it("keeps search, utilities, and the primary action inside one compact content toolbar", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<ContentToolbar ariaLabel="Abstract controls" search={<input aria-label="Search abstracts" />} utilities={<button type="button">Filter</button>} primaryAction={<button type="button">Add Abstract</button>} />));

    const toolbar = container.querySelector<HTMLElement>('section[aria-label="Abstract controls"]')!;
    const search = container.querySelector<HTMLInputElement>('input[aria-label="Search abstracts"]')!;
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
    const filter = buttons.find((button) => button.textContent === "Filter")!;
    const add = buttons.find((button) => button.textContent === "Add Abstract")!;

    expect(toolbar).toContainElement(search);
    expect(toolbar).toContainElement(filter);
    expect(toolbar).toContainElement(add);
    expect(add.parentElement).toHaveClass("order-1", "md:order-2");
    expect(filter.parentElement).toHaveClass("md:order-1");
    expect(add.parentElement?.parentElement).toHaveClass("overflow-x-auto");
    act(() => root.unmount());
    container.remove();
  });
});
