import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvailabilityEditor } from "@/components/availability/AvailabilityEditor";

describe("AvailabilityEditor", () => {
  // "Your time" reads Intl.DateTimeFormat().resolvedOptions().timeZone — the machine's
  // actual system timezone. Pin it to UTC (what CI runs as) so these assertions are
  // deterministic on every machine instead of only passing wherever they were authored.
  beforeEach(() => vi.stubEnv("TZ", "UTC"));
  afterEach(() => vi.unstubAllEnvs());

  it("renders a month-aware half-hour timetable and records exact unavailable slots", () => {
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
    expect(container.querySelector('table[aria-label="Half-hour speaker availability for September 2026"]')).toBeInTheDocument();
    expect(container.querySelectorAll('button[aria-label$=": available"]')).toHaveLength(144);
    expect(container.querySelector(".overflow-auto")).toBeInTheDocument();

    fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Tue, Sep 15, 9:30 AM: available"]')!);
    expect(onChange).toHaveBeenCalledWith({ unavailable: [{ date: Date.UTC(2026, 8, 15), hour: 9, minute: 30 }] });

    fireEvent.click(screen.getByRole("button", { name: "Your time" }));
    expect(screen.getByRole("button", { name: "Your time" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders conference hours in the browser's local time zone", () => {
    render(
      <AvailabilityEditor
        startsAt={Date.UTC(2026, 8, 15)}
        endsAt={Date.UTC(2026, 8, 15)}
        timezone="America/New_York"
        value={{ unavailable: [] }}
        onChange={vi.fn()}
        idPrefix="speaker-availability-local"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Your time" }));

    // Conference hours run midnight–11:30 PM America/New_York. On a UTC test runner, 11:30 PM EDT
    // is 1 AM the next UTC day, so the local-time column legitimately spans two
    // calendar days ("Tue, Sep 15 → Wed, Sep 16") rather than staying on one.
    expect(screen.getByRole("button", { name: "Tue, Sep 15 → Wed, Sep 16, 4 AM: available" })).toBeInTheDocument();
  });

  it("expands legacy hour-only slots to both half-hour cells and toggles a full day at half-hour resolution", () => {
    const onChange = vi.fn();
    const date = Date.UTC(2026, 8, 15);
    render(
      <AvailabilityEditor
        startsAt={date}
        endsAt={date}
        timezone="America/New_York"
        value={{ unavailable: [{ date, hour: 9 }] }}
        onChange={onChange}
        idPrefix="speaker-availability-legacy"
      />,
    );

    expect(screen.getByRole("button", { name: "Tue, Sep 15, 9 AM: unavailable" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tue, Sep 15, 9:30 AM: unavailable" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mark Tue, Sep 15 unavailable all day" }));
    expect(onChange).toHaveBeenLastCalledWith({
      unavailable: Array.from({ length: 48 }, (_, index) => ({ date, hour: Math.floor(index / 2), minute: index % 2 === 0 ? 0 : 30 })),
    });
  });
});
