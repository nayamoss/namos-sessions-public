import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionCard({ title, description, action, children, className, contentClassName }: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn("rounded-lg bg-card p-6", className)}>
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn((title || description || action) && "mt-5", contentClassName)}>{children}</div>
    </section>
  );
}
