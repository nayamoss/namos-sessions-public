import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

const ratings = [
  { value: "excellent", label: "Love it" },
  { value: "good", label: "Good" },
  { value: "okay", label: "Okay" },
  { value: "poor", label: "Needs work" },
] as const;

export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const submitFeedback = useMutation(api.feedback.submit);
  const [rating, setRating] = useState<(typeof ratings)[number]["value"]>();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRating(undefined);
    setNote("");
    setError(undefined);
    setSubmitted(false);
  }, [open]);

  useEffect(() => {
    if (!submitted) return;
    const timer = window.setTimeout(() => onOpenChange(false), 1200);
    return () => window.clearTimeout(timer);
  }, [onOpenChange, submitted]);

  async function submit() {
    if (!rating) {
      setError("Choose a rating before submitting.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await submitFeedback({ rating, ...(note.trim() ? { note: note.trim() } : {}) });
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your feedback could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The shared DialogContent's default className includes a visible border and shadow-lg,
      which violates this app's no-border/no-shadow rule — override both explicitly, matching
      the pattern already used by GlobalKeyboardShortcuts' dialog. */}
      <DialogContent className="max-w-md rounded-[12px] border-0 bg-card shadow-none">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>How is Namos Sessions working for you?</DialogDescription>
        </DialogHeader>
        {submitted ? <p className="py-4 text-sm font-medium">Thanks — got it.</p> : (
          <div className="space-y-5">
            <RadioGroup value={rating} onValueChange={(value) => setRating(value as typeof rating)} aria-label="Feedback rating">
              {ratings.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                  <RadioGroupItem value={option.value} />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </RadioGroup>
            <div className="space-y-2">
              <Label htmlFor="feedback-note">Anything else? <span className="text-muted-foreground">Optional</span></Label>
              <Textarea id="feedback-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Tell us more…" />
            </div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}
        {!submitted && <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button type="button" variant="secondary" onClick={() => void submit()} disabled={submitting}>{submitting ? "Submitting…" : "Submit feedback"}</Button>
        </DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
