import { Skeleton } from "@/components/ui/skeleton";

/**
 * Card-list loading state. Use this instead of a "Loading…" paragraph or a spinner —
 * DESIGN-SYSTEM.md §4 requires skeletons that match the shape of the content they replace.
 */
export function SkeletonList({ rows = 3, label = "Loading…" }: { rows?: number; label?: string }) {
  return <div className="grid gap-4" aria-busy="true" aria-live="polite">
    {Array.from({ length: rows }, (_, row) => <div key={row} className={cardSurfaceClasses("default", "p-5")}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-4 w-56" />
      <Skeleton className="mt-2 h-3 w-72" />
    </div>)}
    <span className="sr-only">{label}</span>
  </div>;
}
import { cardSurfaceClasses } from "@/components/ui/card";
