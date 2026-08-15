import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export type StatusTab = { value: string; label: string; count?: number };
export function StatusTabs({
  tabs,
  value,
  onValueChange,
  ariaLabel = "Views",
}: {
  tabs: StatusTab[];
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activate = (index: number) => {
    const tab = tabs[index];
    if (!tab) return;
    tabRefs.current[index]?.focus();
    onValueChange(tab.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    activate(nextIndex);
  };

  return (
    <div className="min-w-0 overflow-x-auto" data-status-tabs-scroll>
      <div className="flex min-w-max flex-nowrap gap-1" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab, index) => {
          const selected = tab.value === value;
          return (
            <button
              key={tab.value}
              ref={(element) => { tabRefs.current[index] = element; }}
              type="button"
              role="tab"
              tabIndex={selected ? 0 : -1}
              aria-selected={selected}
              onClick={() => onValueChange(tab.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "touch-target shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors",
                selected
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count !== undefined && <span className="ml-1.5 text-xs text-muted-foreground">{tab.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
