import { Check, CircleDashed, X } from "lucide-react";
import type { SubmissionStatus } from "@/data/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const decisions = [
  { status: "accept_queue", label: "Approve", icon: Check, active: "bg-primary text-primary-foreground" },
  { status: "maybe", label: "Maybe", icon: CircleDashed, active: "bg-primary text-primary-foreground" },
  { status: "decline_queue", label: "Decline", icon: X, active: "bg-destructive text-primary-foreground" },
] as const;

export function DecisionButtons({ status, onDecide, pending = false, size = "sm" }: { status: SubmissionStatus; onDecide: (next: SubmissionStatus) => void; pending?: boolean; size?: "sm" | "md" }) {
  const readOnly = ["accepted", "declined", "withdrawn", "draft"].includes(status);
  return <div className={cn("inline-flex items-center gap-1", pending && "opacity-40")} aria-label="Submission decision">
    {decisions.map(({ status: decision, label, icon: Icon, active }) => {
      const selected = status === decision;
      return <Button key={decision} type="button" variant="ghost" aria-label={label} title={size === "sm" ? label : undefined} aria-pressed={selected} disabled={pending || readOnly} onClick={(event) => { event.stopPropagation(); onDecide(selected ? "pending" : decision); }} className={cn("inline-flex items-center justify-center rounded-[6px] bg-muted text-muted-foreground hover:bg-muted", size === "sm" ? "h-8 w-8 p-0" : "h-9 gap-1.5 px-3 text-sm", selected && active)}><Icon className="h-4 w-4" />{size === "md" && <span>{label}</span>}</Button>;
    })}
  </div>;
}
