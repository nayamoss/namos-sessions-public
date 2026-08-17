import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function SectionCard({ title, action, children, className, contentClassName }: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("p-6", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      <CardContent className={cn("p-0", (title || action) && "mt-5", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
