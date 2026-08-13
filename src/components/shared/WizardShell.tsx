import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WizardStep = { id: string; label: string };
export function WizardShell({ steps, activeStep, onStepChange, onBack, onNext, children, finalLabel = "Save", footerStart }: { steps: WizardStep[]; activeStep: number; onStepChange: (step: number) => void; onBack: () => void; onNext: () => void; children: ReactNode; finalLabel?: string; footerStart?: ReactNode }) {
  return <div className="space-y-6"><div className="flex flex-col gap-6 lg:flex-row"><ol className="w-full shrink-0 space-y-1 lg:w-64">{steps.map((step, index) => <li key={step.id}><button type="button" onClick={() => onStepChange(index)} className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm", index === activeStep ? "bg-card text-foreground" : "text-muted-foreground hover:bg-card/70")}><span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-xs", index < activeStep ? "bg-foreground text-background" : index === activeStep ? "bg-muted text-foreground" : "bg-muted text-muted-foreground")}>{index < activeStep ? <Check className="h-3 w-3" /> : index + 1}</span>{step.label}</button></li>)}</ol><div className="min-w-0 flex-1 rounded-lg bg-card p-6">{children}</div></div><div className="flex items-center justify-between gap-3"><div>{footerStart}</div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={onBack} disabled={activeStep === 0}>Back</Button><Button variant="accent" size="sm" onClick={onNext}>{activeStep === steps.length - 1 ? finalLabel : "Next"}</Button></div></div></div>;
}
