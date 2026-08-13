import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AvailabilityEditor } from "@/components/availability/AvailabilityEditor";

describe("AvailabilityEditor", () => {
  it("renders a month-aware hourly timetable and records exact unavailable hours", () => {
    const onChange = vi.fn();
    const { container } = render(
      <AvailabilityEditor
        startsAt={Date.UTC(2026, 8, 15)}
        endsAt={Date.UTC(2026, 8, 17)}
        timezone="America/New_York"
        value={{ unavailable: [] }}
        onChange={onChange}
        idPrefix="speaker-availability"
      />,
    );

    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(container.querySelector('table[aria-label="Hourly speaker availability for September 2026"]')).toBeInTheDocument();
    expect(container.querySelectorAll('button[aria-label$=": available"]')).toHaveLength(45);
    expect(container.querySelector(".overflow-auto")).toBeInTheDocument();

    fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Tue, Sep 15, 9 AM: available"]')!);
    expect(onChange).toHaveBeenCalledWith({ unavailable: [{ date: Date.UTC(2026, 8, 15), hour: 9 }] });

    fireEvent.click(screen.getByRole("button", { name: "Your time" }));
    expect(screen.getByRole("button", { name: "Your time" })).toHaveAttribute("aria-pressed", "true");
  });
});
