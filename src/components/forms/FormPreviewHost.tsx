import { useEffect, useRef } from "react";
import type { PublicSubmissionFormConfig } from "@/data/types";
import { PublicFormRenderer, usePublicFormState } from "@/pages/public/PublicFormRenderer";

// The builder's live preview — same PublicFormRenderer the real public page uses, in
// mode="preview" so it never makes a network call, never renders Turnstile, and the
// email step never actually contacts Clerk. Reflects unsaved edits: `config` is derived
// live from the builder's in-memory pages/fields state on every render, not fetched.
export function FormPreviewHost({ config }: { config: PublicSubmissionFormConfig }) {
  const state = usePublicFormState(config);
  // A page getting added/removed/reordered can leave `step` pointing past the new page
  // count — clamp back to the welcome screen rather than crash or render nothing.
  const pageCount = config.form.pages.length;
  const clamped = useRef(false);
  useEffect(() => {
    if (state.step > pageCount) { state.setStep(0); clamped.current = true; }
  }, [pageCount, state]);
  return (
    <div role="region" aria-label="Call for proposals preview" className="flex h-full flex-col overflow-hidden rounded-[14px] bg-muted/60 p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-medium text-muted-foreground">Preview — reflects unsaved edits</p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-[10px] bg-background shadow-none">
        <div className="h-full overflow-y-auto">
          <PublicFormRenderer config={config} mode="preview" state={state} />
        </div>
      </div>
    </div>
  );
}
