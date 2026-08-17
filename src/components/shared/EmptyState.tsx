import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ message, title, action, icon: Icon, compact = false, className }: {
  message: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  compact?: boolean;
  className?: string;
}) {
  const VisualIcon = Icon ?? Inbox;
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 text-center", compact ? "p-5" : "min-h-48 p-8", className)}>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <VisualIcon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="max-w-lg">
        {title && <p className="font-medium">{title}</p>}
        <p className={cn("text-sm text-muted-foreground", title && "mt-1")}>{message}</p>
      </div>
      {action && <div className="flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
