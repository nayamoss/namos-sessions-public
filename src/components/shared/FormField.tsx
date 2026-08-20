import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export function FormField({ label, children, htmlFor }: {
  label: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
