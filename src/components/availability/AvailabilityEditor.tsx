import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import type { AvailabilitySlot } from "@/data/types";
import { eventDateTimeToEpoch } from "@/lib/event-time";
import { cn } from "@/lib/utils";

export type AvailabilityDraft = {
  unavailable: AvailabilitySlot[];
  notes?: string;
};

const hours = Array.from({ length: 24 }, (_, hour) => hour);
const conferenceHours = hours;
const halfHours = conferenceHours.flatMap((hour) => [{ hour, minute: 0 as const }, { hour, minute: 30 as const }]);
const legacyHours = {
  morning: hours.filter((hour) => hour < 12),
  afternoon: hours.filter((hour) => hour >= 12 && hour < 17),
  evening: hours.filter((hour) => hour >= 17),
} as const;

function calendarDates(startsAt: number, endsAt: number) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const first = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const dates: number[] = [];
  for (let date = first; date <= last && dates.length < 366; date += 86_400_000)
    dates.push(date);
  return dates;
}

function dayLabel(date: number) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function monthKey(date: number) {
  const value = new Date(date);
  return `${value.getUTCFullYear()}-${value.getUTCMonth()}`;
}

function monthLabel(date: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function timezoneLabel(timezone: string) {
  return (timezone.split("/").pop() ?? timezone).replaceAll("_", " ");
}

function hourLabel(hour: number, minute = 0) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: minute === 0 ? undefined : "2-digit",
    hourCycle: "h12",
    timeZone: "UTC",
  }).format(Date.UTC(2026, 0, 1, hour, minute));
}

function dateKey(date: number) {
  return new Date(date).toISOString().slice(0, 10);
}

function zonedParts(epoch: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(epoch);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const date = Date.UTC(value("year"), value("month") - 1, value("day"));
  return { date, hour: value("hour"), minute: value("minute") };
}

function eventSlotEpoch(date: number, hour: number, minute: number, timezone: string) {
  return eventDateTimeToEpoch(dateKey(date), `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, timezone);
}

function localDateRangeLabel(date: number, timezone: string) {
  const first = eventSlotEpoch(date, halfHours[0].hour, halfHours[0].minute, timezone);
  const last = eventSlotEpoch(date, halfHours[halfHours.length - 1].hour, halfHours[halfHours.length - 1].minute, timezone);
  if (first === undefined || last === undefined) return dayLabel(date);
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const start = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: localTimezone }).format(first);
  const end = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: localTimezone }).format(last);
  return start === end ? start : `${start} → ${end}`;
}

function slotKey(date: number, hour: number, minute: number) {
  return `${date}:${hour}:${minute}`;
}

function exactSlots(slots: AvailabilitySlot[]) {
  const normalized = new Map<string, AvailabilitySlot>();
  for (const slot of slots) {
    const slotTimes =
      slot.hour !== undefined
        ? slot.minute !== undefined
          ? [{ hour: slot.hour, minute: slot.minute }]
          : [{ hour: slot.hour, minute: 0 as const }, { hour: slot.hour, minute: 30 as const }]
        : slot.part
          ? legacyHours[slot.part].flatMap((hour) => [{ hour, minute: 0 as const }, { hour, minute: 30 as const }])
          : [];
    for (const { hour, minute } of slotTimes)
      normalized.set(slotKey(slot.date, hour, minute), { date: slot.date, hour, minute });
  }
  return [...normalized.values()];
}

export function AvailabilityEditor({
  startsAt,
  endsAt,
  timezone,
  value,
  onChange,
  idPrefix,
}: {
  startsAt: number;
  endsAt: number;
  timezone: string;
  value: AvailabilityDraft;
  onChange: (value: AvailabilityDraft) => void;
  idPrefix: string;
}) {
  const dates = useMemo(() => calendarDates(startsAt, endsAt), [endsAt, startsAt]);
  const months = useMemo(
    () => dates.filter((date, index) => index === 0 || monthKey(date) !== monthKey(dates[index - 1])),
    [dates],
  );
  const [monthIndex, setMonthIndex] = useState(0);
  const [timeView, setTimeView] = useState<"conference" | "local">("conference");
  const paintMode = useRef<"block" | "clear" | null>(null);
  const slotsRef = useRef(exactSlots(value.unavailable));

  useEffect(() => {
    slotsRef.current = exactSlots(value.unavailable);
  }, [value.unavailable]);
  useEffect(() => {
    setMonthIndex((current) => Math.min(current, Math.max(0, months.length - 1)));
  }, [months.length]);
  useEffect(() => {
    const stopPainting = () => { paintMode.current = null; };
    window.addEventListener("pointerup", stopPainting);
    window.addEventListener("pointercancel", stopPainting);
    return () => {
      window.removeEventListener("pointerup", stopPainting);
      window.removeEventListener("pointercancel", stopPainting);
    };
  }, []);

  const visibleMonth = months[monthIndex] ?? dates[0];
  const visibleDates = useMemo(
    () => dates.filter((date) => monthKey(date) === monthKey(visibleMonth)),
    [dates, visibleMonth],
  );
  const blocked = useMemo(
    () => new Set(exactSlots(value.unavailable).map((slot) => slotKey(slot.date, slot.hour!, slot.minute!))),
    [value.unavailable],
  );
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const displayTimezone = timeView === "local" ? localTimezone : timezone;
  const displayTime = (date: number, hour: number, minute: number) => {
    if (timeView === "conference") return { hour, minute };
    const epoch = eventSlotEpoch(date, hour, minute, timezone);
    return epoch === undefined ? { hour, minute } : zonedParts(epoch, localTimezone);
  };

  const setSlot = (date: number, hour: number, minute: 0 | 30, unavailable: boolean) => {
    const key = slotKey(date, hour, minute);
    const normalized = slotsRef.current;
    if (normalized.some((slot) => slotKey(slot.date, slot.hour!, slot.minute!) === key) === unavailable) return;
    const next = unavailable
      ? [...normalized, { date, hour, minute }]
      : normalized.filter((slot) => slotKey(slot.date, slot.hour!, slot.minute!) !== key);
    slotsRef.current = next;
    onChange({ ...value, unavailable: next });
  };
  const toggle = (date: number, hour: number, minute: 0 | 30) => setSlot(date, hour, minute, !blocked.has(slotKey(date, hour, minute)));
  const toggleDay = (date: number) => {
    const normalized = exactSlots(value.unavailable);
    const fullyUnavailable = halfHours.every(({ hour, minute }) => blocked.has(slotKey(date, hour, minute)));
    const otherDays = normalized.filter((slot) => slot.date !== date);
    const next = fullyUnavailable ? otherDays : [...otherDays, ...halfHours.map(({ hour, minute }) => ({ date, hour, minute }))];
    slotsRef.current = next;
    onChange({
      ...value,
      unavailable: next,
    });
  };
  const clearUnavailable = () => {
    slotsRef.current = [];
    onChange({ ...value, unavailable: [] });
  };
  const timetableRows = halfHours.map(({ hour, minute }) => ({ id: `${hour}-${minute}`, hour, minute }));
  const timetableColumns: DataGridColumn<(typeof timetableRows)[number]>[] = [
    {
      key: "time",
      header: "Time",
      kind: "row-header",
      width: "72px",
      cell: (row) => {
        const display = displayTime(visibleDates[0] ?? dates[0], row.hour, row.minute);
        return <span className="tabular-nums">{hourLabel(display.hour, display.minute)}</span>;
      },
    },
    ...visibleDates.map((date) => ({
      key: String(date),
      header: (
        <button
          type="button"
          onClick={() => toggleDay(date)}
          className="group w-full rounded-sm py-1 text-center focus-visible:outline-none"
          aria-label={`${halfHours.every(({ hour, minute }) => blocked.has(slotKey(date, hour, minute))) ? "Make" : "Mark"} ${dayLabel(date)} ${halfHours.every(({ hour, minute }) => blocked.has(slotKey(date, hour, minute))) ? "available" : "unavailable all day"}`}
        >
          <span className="block font-semibold text-foreground">{timeView === "local" ? localDateRangeLabel(date, timezone) : dayLabel(date)}</span>
          <span className="block text-[11px] font-normal text-muted-foreground">Block day</span>
        </button>
      ),
      headerLabel: dayLabel(date),
      align: "center" as const,
      width: "112px",
      cell: (row: (typeof timetableRows)[number]) => {
        const unavailable = blocked.has(slotKey(date, row.hour, row.minute));
        const display = displayTime(date, row.hour, row.minute);
        const label = `${timeView === "local" ? localDateRangeLabel(date, timezone) : dayLabel(date)}, ${hourLabel(display.hour, display.minute)}: ${unavailable ? "unavailable" : "available"}`;
        return (
          <button
            id={`${idPrefix}-${date}-${row.hour}-${row.minute}`}
            type="button"
            aria-pressed={unavailable}
            aria-label={label}
            title={unavailable ? "Mark available" : "Mark unavailable"}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0) return;
              event.preventDefault();
              paintMode.current = unavailable ? "clear" : "block";
              setSlot(date, row.hour, row.minute, !unavailable);
            }}
            onPointerEnter={(event) => {
              if (!paintMode.current || event.buttons === 0) return;
              setSlot(date, row.hour, row.minute, paintMode.current === "block");
            }}
            onClick={(event) => {
              if (event.detail === 0) toggle(date, row.hour, row.minute);
            }}
            className={cn(
              "group flex h-9 w-full touch-none select-none items-center justify-center rounded-sm transition-colors focus-visible:outline-none",
              unavailable
                ? "bg-destructive/15 text-destructive hover:bg-destructive/20"
                : "bg-muted/55 text-muted-foreground/0 hover:bg-muted hover:text-muted-foreground",
            )}
          >
            {unavailable && <X className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        );
      },
    })),
  ];

  if (!dates.length) return null;
  return (
    <div className="space-y-5">
      <div className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="text-sm font-semibold">{monthLabel(visibleMonth)}</p>
            <p className="text-xs text-muted-foreground">{timezoneLabel(displayTimezone)} time</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto sm:justify-end">
            <div className="flex max-w-full overflow-x-auto rounded-md bg-muted/60 p-0.5" role="group" aria-label="Time zone view">
              <Button
                type="button"
                variant={timeView === "conference" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setTimeView("conference")}
                aria-pressed={timeView === "conference"}
              >
                Conference time
              </Button>
              <Button
                type="button"
                variant={timeView === "local" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setTimeView("local")}
                aria-pressed={timeView === "local"}
              >
                Your time
              </Button>
            </div>
            {blocked.size > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={clearUnavailable}>
                Reset
              </Button>
            )}
            {months.length > 1 && <div className="flex items-center gap-1" aria-label="Month navigation">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Previous month"
              disabled={monthIndex === 0}
              onClick={() => setMonthIndex((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Next month"
              disabled={monthIndex >= months.length - 1}
              onClick={() => setMonthIndex((current) => Math.min(months.length - 1, current + 1))}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
            </div>}
          </div>
        </div>

        <DataGrid
          rows={timetableRows}
          columns={timetableColumns}
          empty="No event hours are available."
          appearance="matrix"
          rowActivation="none"
          minWidth={Math.max(480, 80 + visibleDates.length * 128)}
          ariaLabel={`Half-hour speaker availability for ${monthLabel(visibleMonth)}`}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-notes`}>Notes</Label>
        <Textarea
          id={`${idPrefix}-notes`}
          rows={4}
          className="min-h-28 px-4 py-3 leading-6"
          value={value.notes ?? ""}
          onChange={(event) => onChange({ ...value, notes: event.target.value.slice(0, 1_000) || undefined })}
          placeholder="For example: flying in late Tuesday"
        />
      </div>
    </div>
  );
}
