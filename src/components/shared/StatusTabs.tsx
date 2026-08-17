import { Filter, PanelsTopLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type StatusTab = { value: string; label: string; count?: number };
export function FilterMenu({
  tabs,
  value,
  onValueChange,
  ariaLabel = "Views",
  kind = "filter",
}: {
  tabs: StatusTab[];
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel?: string;
  kind?: "filter" | "view";
}) {
  const selected = tabs.find((tab) => tab.value === value);
  const actionLabel = kind === "filter" ? "Filter" : "View";
  const Icon = kind === "filter" ? Filter : PanelsTopLeft;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${ariaLabel}: ${selected?.label ?? actionLabel}`}
          className="max-w-[15rem]"
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{actionLabel}</span>
          <span className="truncate text-muted-foreground">{selected?.label ?? "All"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{ariaLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
          {tabs.map((tab) => (
            <DropdownMenuRadioItem key={tab.value} value={tab.value}>
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="ml-auto pl-6 text-xs text-muted-foreground">
                  {tab.count}
                </span>
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** @deprecated Use FilterMenu for table and list controls. */
export const StatusTabs = FilterMenu;
