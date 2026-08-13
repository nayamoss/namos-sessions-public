import { ListChecks, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { criteriaErrors } from "@/lib/evaluation-score";
import type { EvaluationCriterion } from "@/data/types";

function newCriterionId() {
  return `criterion-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/**
 * Edits the ordered scoring criteria on one evaluation plan (issue #56). The parent owns the
 * array — every change calls onChange with the whole next array — because nothing is persisted
 * until the plan itself is saved, so removing a row needs no confirmation.
 */
export function CriteriaEditor({ criteria, scoringScaleMax, onChange, disabled }: {
  criteria: EvaluationCriterion[];
  scoringScaleMax: number;
  onChange: (next: EvaluationCriterion[]) => void;
  disabled?: boolean;
}) {
  const errors = criteriaErrors(criteria);
  const addCriterion = () => onChange([...criteria, { id: newCriterionId(), label: "", type: "number", max: scoringScaleMax, weight: 1, required: true }]);
  const update = (id: string, patch: Partial<EvaluationCriterion>) => onChange(criteria.map(criterion => criterion.id === id ? { ...criterion, ...patch } : criterion));
  const remove = (id: string) => onChange(criteria.filter(criterion => criterion.id !== id));

  return <div className="space-y-3">
    <div>
      <p className="text-sm font-medium">Scoring criteria</p>
      <p className="text-sm text-muted-foreground">Reviewers score each criterion. Weights decide how much each one counts.</p>
    </div>
    {criteria.length === 0
      ? <div className="rounded-lg bg-muted/60 p-8 text-center">
        <ListChecks className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
        <p className="mt-3 font-medium">No criteria yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Reviewers will record a single overall score until you add criteria.</p>
        <Button className="mt-4" variant="accent" size="sm" onClick={addCriterion} disabled={disabled}>Add criterion</Button>
      </div>
      : <ul className="space-y-2">
        {criteria.map(criterion => <li key={criterion.id}>
          <div className="grid items-center gap-2 md:grid-cols-[minmax(0,1fr)_8rem_5.5rem_5.5rem_auto_auto]">
            <Input value={criterion.label} onChange={event => update(criterion.id, { label: event.target.value })} placeholder="Originality" aria-label="Criterion label" disabled={disabled} />
            <Select value={criterion.type} onValueChange={value => update(criterion.id, value === "text" ? { type: "text", max: undefined, weight: undefined } : { type: "number", max: criterion.max ?? scoringScaleMax, weight: criterion.weight ?? 1 })} disabled={disabled}>
              <SelectTrigger aria-label="Criterion type"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="number">Score</SelectItem><SelectItem value="text">Comment</SelectItem></SelectContent>
            </Select>
            {criterion.type === "number"
              ? <Input type="number" min={1} max={100} value={criterion.max ?? ""} onChange={event => update(criterion.id, { max: event.target.value === "" ? undefined : Number(event.target.value) })} aria-label={`Maximum for ${criterion.label || "criterion"}`} disabled={disabled} />
              : <span className="text-sm text-muted-foreground">—</span>}
            {criterion.type === "number"
              ? <Input type="number" min={0} step="0.5" max={100} value={criterion.weight ?? ""} onChange={event => update(criterion.id, { weight: event.target.value === "" ? undefined : Number(event.target.value) })} aria-label={`Weight for ${criterion.label || "criterion"}`} disabled={disabled} />
              : <span className="text-sm text-muted-foreground">—</span>}
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={criterion.required} onCheckedChange={checked => update(criterion.id, { required: checked === true })} aria-label={`Require ${criterion.label || "criterion"}`} disabled={disabled} />
              Required
            </label>
            <Button variant="ghost" size="icon" onClick={() => remove(criterion.id)} aria-label={`Remove ${criterion.label || "criterion"}`} disabled={disabled}><X className="h-4 w-4" /></Button>
          </div>
          {errors.get(criterion.id) && <p className="mt-1 text-sm text-destructive">{errors.get(criterion.id)}</p>}
        </li>)}
      </ul>}
    {criteria.length > 0 && <Button variant="outline" size="sm" onClick={addCriterion} disabled={disabled}>Add criterion</Button>}
  </div>;
}
