import { forwardRef, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Reuses this repo's existing shadcn Calendar (react-day-picker, already a dependency) instead of
// the raw browser datetime-local widget — same component pattern already used for date pickers
// elsewhere in the shadcn ecosystem this codebase is built on. Paired with a plain time field for
// the minutes, since a calendar grid isn't a good time-of-day picker and Typeform-style flows
// keep each control single-purpose. The Calendar's own `day_selected` style already reads
// `bg-primary`, so it automatically follows whatever accent the surrounding page scopes in.
export const DateTimeField = forwardRef<HTMLButtonElement, {
  valueMs: number;
  onChange: (ms: number) => void;
  autoFocus?: boolean;
}>(function DateTimeField({ valueMs, onChange, autoFocus }, ref) {
  const [open, setOpen] = useState(false);
  const date = new Date(valueMs);
  const timeValue = Number.isNaN(date.getTime()) ? "" : format(date, "HH:mm");

  const applyDate = (nextDay: Date | undefined) => {
    if (!nextDay) return;
    const next = new Date(nextDay);
    next.setHours(date.getHours() || 0, date.getMinutes() || 0, 0, 0);
    onChange(next.getTime());
    setOpen(false);
  };

  const applyTime = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return;
    const next = new Date(date);
    next.setHours(hours, minutes, 0, 0);
    onChange(next.getTime());
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            autoFocus={autoFocus}
            className="h-11 flex-1 justify-start rounded-[12px] bg-card px-4 text-left font-normal"
          >
            <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
            {Number.isNaN(date.getTime()) ? "Pick a date" : format(date, "PPP")}
          </Button>
        </PopoverTrigger>
        <PopoverContent data-onboarding-popover="true" className="w-auto rounded-[12px] border-0 p-0 shadow-none" align="start">
          <Calendar mode="single" selected={Number.isNaN(date.getTime()) ? undefined : date} onSelect={applyDate} autoFocus />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        value={timeValue}
        onChange={(event) => applyTime(event.target.value)}
        className="h-11 w-full rounded-[12px] bg-card sm:w-[10rem]"
        aria-label="Time"
      />
    </div>
  );
});
