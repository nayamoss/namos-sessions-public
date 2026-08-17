import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Sponsor, SubmissionRoutingRule, Tag, Track } from "@/data/types";

export type RoutingFieldOption = { id: string; label: string; options: string[] };

const noTarget = "__unchanged__";
const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "accept_queue", label: "Accept queue" },
  { value: "accepted", label: "Accepted" },
  { value: "maybe", label: "Maybe" },
] as const;

function toggle<Value>(values: Value[] | undefined, value: Value, checked: boolean) {
  return checked ? [...new Set([...(values ?? []), value])] : (values ?? []).filter((item) => item !== value);
}

export function RoutingRulesEditor({
  fields,
  tags,
  tracks,
  reviewers,
  sponsors,
  rules,
  onChange,
}: {
  fields: RoutingFieldOption[];
  tags: Tag[];
  tracks: Track[];
  reviewers: string[];
  sponsors: Sponsor[];
  rules: SubmissionRoutingRule[];
  onChange: (rules: SubmissionRoutingRule[]) => void;
}) {
  const update = (index: number, patch: Partial<SubmissionRoutingRule>) => onChange(
    rules.map((rule, position) => position === index ? { ...rule, ...patch } : rule),
  );
  const add = () => {
    const field = fields[0];
    const equals = field?.options[0];
    if (!field || !equals) return;
    onChange([...rules, { id: `routing-${Date.now()}-${rules.length}`, fieldId: field.id, equals, setStatus: "pending" }]);
  };

  return <section className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">Routing</h2>
        <p className="mt-1 text-sm text-muted-foreground">Route submissions by a configured category. Matching rules run in order; later status and track choices take precedence.</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={add} disabled={!fields.length}>Add rule</Button>
    </div>
    {!fields.length && <p className="rounded-md bg-background p-4 text-sm text-muted-foreground">Add options to a proposal dropdown or multiselect field before creating routing rules.</p>}
    {fields.length > 0 && rules.length === 0 && <p className="rounded-md bg-background p-4 text-sm text-muted-foreground">No routing rules yet. Submissions will remain pending until a rule matches.</p>}
    {rules.map((rule, index) => {
      const field = fields.find((candidate) => candidate.id === rule.fieldId) ?? fields[0];
      return <article key={rule.id} className="space-y-4 rounded-md bg-background p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Rule {index + 1}</p>
          <Button type="button" variant="ghost" size="icon" aria-label={`Delete routing rule ${index + 1}`} onClick={() => onChange(rules.filter((_, position) => position !== index))}><Trash2 /></Button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Category field</Label>
            <Select value={rule.fieldId} onValueChange={(fieldId) => {
              const nextField = fields.find((candidate) => candidate.id === fieldId);
              update(index, { fieldId, equals: nextField?.options[0] ?? "" });
            }}>
              <SelectTrigger aria-label={`Routing rule ${index + 1} field`}><SelectValue /></SelectTrigger>
              <SelectContent>{fields.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Value</Label>
            <Select value={rule.equals} onValueChange={(equals) => update(index, { equals })}>
              <SelectTrigger aria-label={`Routing rule ${index + 1} value`}><SelectValue /></SelectTrigger>
              <SelectContent>{field.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={rule.setStatus ?? noTarget} onValueChange={(value) => update(index, { setStatus: value === noTarget ? undefined : value as SubmissionRoutingRule["setStatus"] })}>
              <SelectTrigger aria-label={`Routing rule ${index + 1} status`}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={noTarget}>Keep default pending</SelectItem>{statusOptions.map((status) => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Track</Label>
            <Select value={rule.assignTrackId ?? noTarget} onValueChange={(value) => update(index, { assignTrackId: value === noTarget ? undefined : value })}>
              <SelectTrigger aria-label={`Routing rule ${index + 1} track`}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={noTarget}>Do not assign a track</SelectItem>{tracks.map((track) => <SelectItem key={track.id} value={track.id}>{track.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Link submission to sponsor</Label>
            <Select value={rule.assignSponsorId ?? noTarget} onValueChange={(value) => update(index, { assignSponsorId: value === noTarget ? undefined : value as SubmissionRoutingRule["assignSponsorId"] })}>
              <SelectTrigger aria-label={`Routing rule ${index + 1} sponsor`}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={noTarget}>Do not link a sponsor</SelectItem>{sponsors.map((sponsor) => <SelectItem key={sponsor.id} value={sponsor.id}>{sponsor.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <fieldset className="space-y-2 rounded-md bg-muted p-3">
          <legend className="text-sm font-medium">Tags</legend>
          {tags.length === 0 ? <p className="text-xs text-muted-foreground">No event tags are configured.</p> : <div className="flex flex-wrap gap-x-5 gap-y-2">{tags.map((tag) => <label key={tag.id} className="flex items-center gap-2 text-sm"><Checkbox checked={rule.assignTagIds?.includes(tag.id) ?? false} onCheckedChange={(checked) => update(index, { assignTagIds: toggle(rule.assignTagIds, tag.id, checked === true) })} />{tag.name}</label>)}</div>}
        </fieldset>
        <fieldset className="space-y-2 rounded-md bg-muted p-3">
          <legend className="text-sm font-medium">Reviewers</legend>
          {reviewers.length === 0 ? <p className="text-xs text-muted-foreground">Assign a reviewer to this event once in Evaluation before using reviewer routing.</p> : <div className="flex flex-wrap gap-x-5 gap-y-2">{reviewers.map((reviewer) => <label key={reviewer} className="flex items-center gap-2 text-sm"><Checkbox checked={rule.reviewerUserIds?.includes(reviewer) ?? false} onCheckedChange={(checked) => update(index, { reviewerUserIds: toggle(rule.reviewerUserIds, reviewer, checked === true) })} />{reviewer}</label>)}</div>}
        </fieldset>
      </article>;
    })}
  </section>;
}
