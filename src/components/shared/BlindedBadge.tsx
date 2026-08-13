import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

// Marks a surface whose speaker identity the server withholds. Presentational only — it explains
// an absence the server already created, it never creates one. See convex/evaluations.ts.
export function BlindedBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-[10px] bg-muted px-2 py-1 text-xs font-medium text-muted-foreground", className)}>
      <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />
      Blinded
    </span>
  );
}
