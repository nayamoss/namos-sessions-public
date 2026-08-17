import { cn } from "@/lib/utils";
import { cardSurfaceClasses } from "@/components/ui/card";

export function SegmentedControl<Value extends string>({ label, value, options, onChange, disabled, className }: {
  label: string;
  value: Value;
  options: Array<{ value: Value; label: string; disabled?: boolean }>;
  onChange: (value: Value) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn(cardSurfaceClasses("default", "flex max-w-full items-center gap-1 overflow-x-auto bg-muted p-1"), className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled || option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "touch-target h-10 shrink-0 rounded-md px-3.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            value === option.value
              ? "bg-background font-medium text-foreground"
              : "text-foreground/70 hover:bg-background/60 hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
