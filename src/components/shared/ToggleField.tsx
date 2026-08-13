import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function ToggleField({ label, checked, onCheckedChange, hint, surface = false, className }: {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  hint?: ReactNode;
  surface?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("flex gap-4", surface ? "items-start justify-between rounded-md bg-background p-4" : "items-center text-sm", className)}>
      <span className={surface ? "order-first" : "order-last"}>
        <span className={cn(surface && "text-sm font-medium")}>{label}</span>
        {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}
