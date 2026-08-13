import { cn } from "@/lib/utils";

export function SegmentedControl<Value extends string>({ label, value, options, onChange, disabled, className }: {
  label: string;
  value: Value;
  options: Array<{ value: Value; label: string; disabled?: boolean }>;
  onChange: (value: Value) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex items-center gap-1 rounded-lg bg-muted p-1", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled || option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-7 rounded-md px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            value === option.value
              ? "bg-background font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
