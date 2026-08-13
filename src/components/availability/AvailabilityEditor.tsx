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
const conferenceHours = hours.filter((hour) => hour >= 7 && hour <= 21);
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

function hourLabel(hour: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h12",
    timeZone: "UTC",
  }).format(Date.UTC(2026, 0, 1, hour));
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
    hourCycle: "h23",
  }).formatToParts(epoch);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const date = Date.UTC(value("year"), value("month") - 1, value("day"));
  return { date, hour: value("hour") };
}

function eventSlotEpoch(date: number, hour: number, timezone: string) {
  return eventDateTimeToEpoch(dateKey(date), `${String(hour).padStart(2, "0")}:00`, timezone);
}

function localDateRangeLabel(date: number, timezone: string) {
  const first = eventSlotEpoch(date, conferenceHours[0], timezone);
  const last = eventSlotEpoch(date, conferenceHours[conferenceHours.length - 1], timezone);
  if (first === undefined || last === undefined) return dayLabel(date);
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const start = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: localTimezone }).format(first);
  const end = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: localTimezone }).format(last);
  return start === end ? start : `${start} → ${end}`;
}

function slotKey(date: number, hour: number) {
  return `${date}:${hour}`;
}

function exactSlots(slots: AvailabilitySlot[]) {
  const normalized = new Map<string, AvailabilitySlot>();
  for (const slot of slots) {
    const slotHours =
      slot.hour !== undefined
        ? [slot.hour]
        : slot.part
          ? legacyHours[slot.part]
          : [];
    for (const hour of slotHours)
      normalized.set(slotKey(slot.date, hour), { date: slot.date, hour });
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
    () => new Set(exactSlots(value.unavailable).map((slot) => slotKey(slot.date, slot.hour!))),
    [value.unavailable],
  );
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const displayTimezone = timeView === "local" ? localTimezone : timezone;
  const displayHour = (date: number, hour: number) => {
    if (timeView === "conference") return hour;
    const epoch = eventSlotEpoch(date, hour, timezone);
    return epoch === undefined ? hour : zonedParts(epoch, localTimezone).hour;
  };

  const setSlot = (date: number, hour: number, unavailable: boolean) => {
    const key = slotKey(date, hour);
    const normalized = slotsRef.current;
    if (normalized.some((slot) => slotKey(slot.date, slot.hour!) === key) === unavailable) return;
    const next = unavailable
      ? [...normalized, { date, hour }]
      : normalized.filter((slot) => slotKey(slot.date, slot.hour!) !== key);
    slotsRef.current = next;
    onChange({ ...value, unavailable: next });
  };
  const toggle = (date: number, hour: number) => setSlot(date, hour, !blocked.has(slotKey(date, hour)));
  const toggleDay = (date: number) => {
    const normalized = exactSlots(value.unavailable);
    const fullyUnavailable = hours.every((hour) => blocked.has(slotKey(date, hour)));
    const otherDays = normalized.filter((slot) => slot.date !== date);
    const next = fullyUnavailable ? otherDays : [...otherDays, ...hours.map((hour) => ({ date, hour }))];
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
  const timetableRows = conferenceHours.map((hour) => ({ id: String(hour), hour }));
  const timetableColumns: DataGridColumn<(typeof timetableRows)[number]>[] = [
    {
      key: "time",
      header: "Time",
      kind: "row-header",
      width: "72px",
      cell: (row) => <span className="tabular-nums">{hourLabel(displayHour(visibleDates[0] ?? dates[0], row.hour))}</span>,
    },
    ...visibleDates.map((date) => ({
      key: String(date),
      header: (
        <button
          type="button"
          onClick={() => toggleDay(date)}
          className="group w-full rounded-sm py-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
          aria-label={`${hours.every((hour) => blocked.has(slotKey(date, hour))) ? "Make" : "Mark"} ${dayLabel(date)} ${hours.every((hour) => blocked.has(slotKey(date, hour))) ? "available" : "unavailable all day"}`}
        >
          <span className="block font-semibold text-foreground">{timeView === "local" ? localDateRangeLabel(date, timezone) : dayLabel(date)}</span>
          <span className="block text-[11px] font-normal text-muted-foreground">Block day</span>
        </button>
      ),
      headerLabel: dayLabel(date),
      align: "center" as const,
      width: "112px",
      cell: (row: (typeof timetableRows)[number]) => {
        const unavailable = blocked.has(slotKey(date, row.hour));
        const label = `${timeView === "local" ? localDateRangeLabel(date, timezone) : dayLabel(date)}, ${hourLabel(displayHour(date, row.hour))}: ${unavailable ? "unavailable" : "available"}`;
        return (
          <button
            id={`${idPrefix}-${date}-${row.hour}`}
            type="button"
            aria-pressed={unavailable}
            aria-label={label}
            title={unavailable ? "Mark available" : "Mark unavailable"}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0) return;
              event.preventDefault();
              paintMode.current = unavailable ? "clear" : "block";
              setSlot(date, row.hour, !unavailable);
            }}
            onPointerEnter={(event) => {
              if (!paintMode.current || event.buttons === 0) return;
              setSlot(date, row.hour, paintMode.current === "block");
            }}
            onClick={(event) => {
              if (event.detail === 0) toggle(date, row.hour);
            }}
            className={cn(
              "group flex h-9 w-full touch-none select-none items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40",
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
          <div className="flex items-center gap-1">
            <div className="inline-flex rounded-md bg-muted/60 p-0.5" role="group" aria-label="Time zone view">
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
          ariaLabel={`Hourly speaker availability for ${monthLabel(visibleMonth)}`}
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
