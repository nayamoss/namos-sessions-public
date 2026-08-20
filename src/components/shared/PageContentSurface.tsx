import type { ReactNode } from "react";
import { cardSurfaceClasses } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** The single, shared working surface used by every dashboard page. */
export function PageContentSurface({
  children,
  className,
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "conversation";
}) {
  return (
    <section
      aria-label="Page content"
      className={
        variant === "conversation"
          ? cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background", className)
          : cardSurfaceClasses(
              "default",
              cn(
                "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden",
                className,
              ),
            )
      }
    >
      {children}
    </section>
  );
}
