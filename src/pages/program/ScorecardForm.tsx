import { Textarea } from "@/components/ui/textarea";
import { weightedTotal } from "@/lib/evaluation-score";
import type { EvaluationCriterion, EvaluationCriterionScore } from "@/data/types";
import { StarRating } from "@/components/shared/StarRating";

/**
 * The reviewer-facing scorecard (issue #56): one input per criterion, plus a live weighted
 * total. A plan with no criteria renders nothing at all — the caller keeps showing the existing
 * single score input, which is the explicit no-regression fallback (FR-008).
 */
export function ScorecardForm({ criteria, values, scoringScaleMax, onChange, legacyScore, error, disabled }: {
  criteria: EvaluationCriterion[];
  values: EvaluationCriterionScore[];
  scoringScaleMax: number;
  onChange: (next: EvaluationCriterionScore[]) => void;
  legacyScore?: number;
  error?: string;
  disabled?: boolean;
}) {
  if (!criteria.length) return null;
  const byId = new Map(values.map(value => [value.criterionId, value]));
  const set = (criterionId: string, patch: EvaluationCriterionScore) => {
    const rest = values.filter(value => value.criterionId !== criterionId);
    onChange([...rest, patch]);
  };
  const total = weightedTotal(criteria, values, scoringScaleMax);

  return <div className="mt-6 space-y-5">
    {legacyScore !== undefined && <p className="text-sm text-muted-foreground">Legacy score: {legacyScore}/{scoringScaleMax}</p>}
    {criteria.map(criterion => {
      const recorded = byId.get(criterion.id);
      if (criterion.type === "text") return <div key={criterion.id}>
        <label className="text-sm font-medium" htmlFor={`criterion-${criterion.id}`}>{criterion.label}{criterion.required && <span className="ml-2 font-normal text-muted-foreground">Required</span>}</label>
        <Textarea id={`criterion-${criterion.id}`} rows={3} className="mt-2" value={recorded?.text ?? ""} disabled={disabled} onChange={event => set(criterion.id, { criterionId: criterion.id, text: event.target.value })} placeholder="Your notes on this criterion." />
      </div>;
      const max = criterion.max ?? scoringScaleMax;
      return <fieldset key={criterion.id}>
        <legend className="text-sm font-medium">{criterion.label} <span className="font-normal text-muted-foreground">(0–{max}{criterion.weight !== undefined && criterion.weight !== 1 ? ` · weight ${criterion.weight}` : ""})</span>{criterion.required && <span className="ml-2 text-sm font-normal text-muted-foreground">Required</span>}</legend>
        <div className="mt-2"><StarRating value={recorded?.value} max={max} min={0} onChange={value => set(criterion.id, { criterionId: criterion.id, value })} disabled={disabled} label={criterion.label} size={max === 10 ? "sm" : "md"} /></div>
      </fieldset>;
    })}
    <p className="text-right text-sm font-medium">Total {total === undefined ? "—" : total.toFixed(2)} / {scoringScaleMax}</p>
    {error && <p className="text-sm text-destructive">{error}</p>}
  </div>;
}
