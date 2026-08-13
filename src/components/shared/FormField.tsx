import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export function FormField({ label, children, hint, htmlFor }: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
