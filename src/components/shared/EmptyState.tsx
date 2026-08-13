import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ message, title, action, icon: Icon, compact = false, className }: {
  message: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 text-center", compact ? "p-5" : "min-h-40 p-6", className)}>
      {Icon && <Icon className="h-9 w-9 text-muted-foreground" aria-hidden="true" />}
      <div>
        {title && <p className="font-medium">{title}</p>}
        <p className={cn("text-sm text-muted-foreground", title && "mt-1")}>{message}</p>
      </div>
      {action}
    </div>
  );
}
