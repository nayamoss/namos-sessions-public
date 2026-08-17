import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
export function StatCard({
  label,
  value,
  icon: Icon,
  compact = false,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  compact?: boolean;
}) {
  if (compact)
    return (
      <Card variant="muted" className="flex min-w-0 items-center gap-3 p-3">
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-primary">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-lg font-semibold leading-none tabular-nums">
            {value}
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {label}
          </span>
        </span>
      </Card>
    );
  return (
    <Card variant="muted" className="p-4">
      <div className="flex items-start justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <p className="mt-3 text-2xl font-bold">{value}</p>
    </Card>
  );
}
