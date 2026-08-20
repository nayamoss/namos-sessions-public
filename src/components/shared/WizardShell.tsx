import type { KeyboardEvent, ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type WizardStep = { id: string; label: string };
// `layout="row"` (default) puts the step list beside the content at the `lg` viewport breakpoint —
// correct for full-width pages like the CFP builder. `layout="stack"` keeps the step list above the
// content at every width, for narrower hosts (e.g. AppLayout's ~400px detail panel) where the
// viewport itself may be wide even though the available space for this component is not.
export function WizardShell({
  steps,
  activeStep,
  onStepChange,
  onBack,
  onNext,
  children,
  finalLabel = "Save",
  footerStart,
  layout = "row",
}: {
  steps: WizardStep[];
  activeStep: number;
  onStepChange: (step: number) => void;
  onBack: () => void;
  onNext: () => void;
  children: ReactNode;
  finalLabel?: string;
  footerStart?: ReactNode;
  layout?: "row" | "stack";
}) {
  const progress =
    steps.length < 2 ? 100 : (activeStep / (steps.length - 1)) * 100;
  const nextLabel = activeStep === steps.length - 1 ? finalLabel : "Next";
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      event.defaultPrevented ||
      event.key !== "Enter" ||
      (!event.metaKey && !event.ctrlKey) ||
      target.closest("[contenteditable=\"true\"]")
    )
      return;
    event.preventDefault();
    if (event.shiftKey) onBack();
    else onNext();
  };
  return (
    <div className="space-y-6" onKeyDown={handleKeyDown}>
      <div
        className="space-y-2"
        aria-label={`Step ${activeStep + 1} of ${steps.length}`}
      >
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {activeStep + 1} of {steps.length} · {steps[activeStep]?.label}
        </p>
      </div>
      <div
        className={cn("flex flex-col gap-6", layout === "row" && "lg:flex-row")}
      >
        <ol
          className={cn(
            "w-full shrink-0 space-y-1",
            layout === "row" && "lg:w-64",
          )}
        >
          {steps.map((step, index) => (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onStepChange(index)}
                className={cn(
                  "touch-target flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
                  index === activeStep
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:bg-card/70",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                    index < activeStep
                      ? "bg-foreground text-background"
                      : index === activeStep
                        ? "bg-muted text-foreground"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {index < activeStep ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    index + 1
                  )}
                </span>
                {step.label}
              </button>
            </li>
          ))}
        </ol>
        <div
          className={cardSurfaceClasses("default", "min-w-0 flex-1 p-4 sm:p-6")}
        >
          {children}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>{footerStart}</div>
        <div className="ml-auto flex items-center gap-3">
          <p
            className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex"
            aria-label={`Keyboard shortcuts: Command or Control Enter for ${nextLabel}; Shift Command or Control Enter for back`}
          >
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">⌘</kbd>
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">↵</kbd>
            <span>{nextLabel}</span>
            <span className="mx-1">·</span>
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">⇧⌘</kbd>
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">↵</kbd>
            <span>Back</span>
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onBack}
              disabled={activeStep === 0}
            >
              Back
            </Button>
            <Button variant="accent" size="sm" onClick={onNext}>
              {nextLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
