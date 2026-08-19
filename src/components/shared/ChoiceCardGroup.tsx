import { cn } from "@/lib/utils";
import { cardSurfaceClasses } from "@/components/ui/card";
export function ChoiceCardGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; description?: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "touch-target p-4 text-left",
            cardSurfaceClasses(),
            value === option.value && "bg-muted",
          )}
        >
          <p className="text-sm font-medium">{option.label}</p>
          {option.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {option.description}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}
