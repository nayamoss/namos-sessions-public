import { forwardRef, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getTimezoneOptions } from "@/lib/timezones";
import { cn } from "@/lib/utils";

function friendlyZoneLabel(zone: string, now: Date): string {
  try {
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value;
    return offset ? `${zone.replace(/_/g, " ")} (${offset})` : zone.replace(/_/g, " ");
  } catch {
    return zone.replace(/_/g, " ");
  }
}

export const TimezoneCombobox = forwardRef<HTMLButtonElement, {
  value: string;
  onChange: (zone: string) => void;
  id?: string;
  autoFocus?: boolean;
  triggerClassName?: string;
}>(function TimezoneCombobox({ value, onChange, id, autoFocus, triggerClassName }, ref) {
  const [open, setOpen] = useState(false);
  const now = useMemo(() => new Date(), []);
  const zones = useMemo(() => getTimezoneOptions(value), [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          ref={ref}
          type="button"
          variant="outline"
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open}
          className={cn("h-11 w-full justify-between rounded-[12px] bg-card px-4 text-left font-normal", triggerClassName)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{value ? friendlyZoneLabel(value, now) : "Select your timezone"}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent data-onboarding-popover="true" className="w-[min(24rem,90vw)] rounded-[12px] border-0 p-0 shadow-none" align="start">
        <Command filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Type to filter timezones…" />
          <CommandList>
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {zones.map((zone) => (
                <CommandItem
                  key={zone}
                  value={zone}
                  onSelect={() => {
                    onChange(zone);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === zone ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{friendlyZoneLabel(zone, now)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
