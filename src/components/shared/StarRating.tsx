import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function StarRating({ value, max, onChange, disabled = false, label, size = "md", min = 1 }: {
  value: number | undefined;
  max: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  label: string;
  size?: "sm" | "md";
  min?: 0 | 1;
}) {
  const [hovered, setHovered] = useState<number>();
  const readOnly = !onChange;
  const displayValue = !readOnly && hovered !== undefined ? hovered : value;
  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const choose = (next: number) => onChange?.(next);
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (readOnly || disabled) return;
    const current = value ?? min;
    let next: number | undefined;
    if (event.key === "ArrowLeft") next = Math.max(min, current - 1);
    if (event.key === "ArrowRight") next = Math.min(max, current + 1);
    if (event.key === "Home") next = min;
    if (event.key === "End") next = max;
    if (next !== undefined) { event.preventDefault(); choose(next); }
  };

  return <div className={cn("inline-flex items-center gap-1", disabled && "pointer-events-none opacity-40")} role="radiogroup" aria-label={label} aria-readonly={readOnly || undefined}>
    {min === 0 && <Button type="button" variant="ghost" size="icon" role="radio" aria-checked={value === 0} aria-label={`${label}: 0 of ${max}`} disabled={disabled || readOnly} onClick={() => choose(0)} onKeyDown={onKeyDown} className={cn("h-auto w-auto rounded-[4px] p-0.5 text-xs", value === 0 ? "text-primary" : "text-muted-foreground")}>0</Button>}
    <div className="flex flex-nowrap items-center gap-0.5">
      {Array.from({ length: max }, (_, index) => {
        const rating = index + 1;
        const filled = (displayValue ?? 0) >= rating;
        return <Button key={rating} type="button" variant="ghost" size="icon" role="radio" aria-checked={value === rating} aria-label={`${label}: ${rating} of ${max}`} disabled={disabled || readOnly} tabIndex={readOnly ? -1 : undefined} onClick={() => choose(rating)} onKeyDown={onKeyDown} onMouseEnter={() => !readOnly && setHovered(rating)} onMouseLeave={() => setHovered(undefined)} className={cn("h-auto w-auto rounded-[4px] p-0.5 hover:bg-transparent", !readOnly && "focus-visible:ring-2 focus-visible:ring-ring", filled ? "text-primary" : "text-muted-foreground")}>
          <Star className={cn(iconSize, filled && "fill-current")} />
        </Button>;
      })}
    </div>
    <span className="ml-1 whitespace-nowrap text-xs text-muted-foreground">{value === undefined ? "Not scored" : `${value} / ${max}`}</span>
  </div>;
}
