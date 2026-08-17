import { useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useOnboardingTourStore } from "@/lib/onboardingTourStore";
import { TOUR_STEPS } from "@/lib/tourSteps";

type Rect = { top: number; left: number; width: number; height: number };

function positionFor(rect: Rect, placement: "right" | "bottom" | "left") {
  if (placement === "left") return { top: rect.top, left: Math.max(12, rect.left - 324) };
  if (placement === "bottom") return { top: rect.top + rect.height + 16, left: Math.max(12, rect.left) };
  return { top: rect.top, left: rect.left + rect.width + 16 };
}

export function TourOverlay() {
  const { isTourActive, tourStep, endTour, nextTourStep, prevTourStep } = useOnboardingTourStore();
  const [rect, setRect] = useState<Rect>();
  const step = TOUR_STEPS[tourStep];

  useLayoutEffect(() => {
    if (!isTourActive || !step) return;
    const target = document.querySelector<HTMLElement>(step.targetSelector);
    if (!target) {
      setRect(undefined);
      return;
    }
    const measure = () => {
      const next = target.getBoundingClientRect();
      setRect({ top: next.top - 6, left: next.left - 6, width: next.width + 12, height: next.height + 12 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isTourActive, step]);

  useEffect(() => {
    if (!isTourActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") endTour();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [endTour, isTourActive]);

  if (!isTourActive || !step || !rect) return null;
  const tooltip = positionFor(rect, step.placement);
  const lastStep = tourStep === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[70]" aria-live="polite">
      <Button type="button" variant="ghost" aria-label="End tour" className="absolute inset-0 h-auto w-auto cursor-default rounded-none p-0" onClick={endTour} />
      <div
        className="pointer-events-none fixed rounded-[10px]"
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)" }}
      />
      <section
        role="dialog"
        aria-label={`Tour step ${tourStep + 1}`}
        className="fixed w-[min(19rem,calc(100vw-24px))] rounded-[12px] bg-card p-4 text-card-foreground"
        style={tooltip}
      >
        <p className="text-sm font-semibold">{step.headline}</p>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-label={`${tourStep + 1} of ${TOUR_STEPS.length}`}>
            {TOUR_STEPS.map((tour, index) => <span key={tour.id} className={`h-1.5 w-1.5 rounded-full ${index === tourStep ? "bg-foreground" : "bg-muted-foreground/35"}`} />)}
            <span className="ml-1 text-xs text-muted-foreground">{tourStep + 1} / {TOUR_STEPS.length}</span>
          </div>
          <div className="flex items-center gap-1">
            {tourStep > 0 && <Button type="button" variant="ghost" size="sm" onClick={prevTourStep}>Back</Button>}
            <Button type="button" variant="secondary" size="sm" onClick={nextTourStep}>{lastStep ? "Done" : "Next"}</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
