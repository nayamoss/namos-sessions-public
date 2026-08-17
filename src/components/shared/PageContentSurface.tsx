import type { ReactNode } from "react";
import { cardSurfaceClasses } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** The single, shared working surface used by every dashboard page. */
export function PageContentSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label="Page content"
      className={cardSurfaceClasses(
        "default",
        cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden",
          className,
        ),
      )}
    >
      {children}
    </section>
  );
}
