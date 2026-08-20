import { describe, expect, it } from "vitest";
import {
  agendaDayGroups,
  agendaRoomSlots,
  agendaTrackGroups,
  agendaWeekGroups,
  snapToAgendaInterval,
} from "@/pages/program/Agenda";

type TestSession = {
  id: string;
  startTime: number;
  track: string;
};

describe("agenda view grouping", () => {
  const timeZone = "America/New_York";
  const sessions: TestSession[] = [
    { id: "late", startTime: Date.UTC(2026, 8, 16, 0, 30), track: "Agents" },
    { id: "next-day", startTime: Date.UTC(2026, 8, 16, 13), track: "Platforms" },
    { id: "early", startTime: Date.UTC(2026, 8, 15, 13, 30), track: "Agents" },
  ];

  it("groups and sorts sessions by their event-local day", () => {
    const groups = agendaDayGroups(sessions, timeZone);

    expect(groups.map((group) => group.date)).toEqual(["2026-09-15", "2026-09-16"]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["early", "late"]);
    expect(groups[1].items.map((item) => item.id)).toEqual(["next-day"]);
  });

  it("creates one week column for every event day, including empty days", () => {
    const groups = agendaWeekGroups(
      sessions,
      Date.UTC(2026, 8, 15),
      Date.UTC(2026, 8, 17),
      timeZone,
    );

    expect(groups.map((group) => group.date)).toEqual([
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
    ]);
    expect(groups.map((group) => group.items.length)).toEqual([2, 1, 0]);
  });

  it("groups sessions by track with a stable time ordering", () => {
    const groups = agendaTrackGroups(sessions);

    expect(groups.map((group) => [group.track, group.items.length])).toEqual([
      ["Agents", 2],
      ["Platforms", 1],
    ]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["early", "late"]);
  });

  it("creates continuous 15-minute room slots even when no session starts there", () => {
    const slots = agendaRoomSlots("2026-09-15", [], timeZone);
    expect(slots).toHaveLength(40);
    expect(slots[1] - slots[0]).toBe(15 * 60_000);
  });

  it("uses configured schedule working hours when the grid is empty", () => {
    const slots = agendaRoomSlots("2026-09-15", [], timeZone, "09:00", "17:00");
    expect(slots).toHaveLength(32);
  });

  it("snaps drag targets to the nearest 15-minute event-timezone interval", () => {
    const value = Date.UTC(2026, 8, 15, 13, 22);
    const snapped = snapToAgendaInterval(value, timeZone);
    expect(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(snapped)).toBe("09:15");
  });
});
