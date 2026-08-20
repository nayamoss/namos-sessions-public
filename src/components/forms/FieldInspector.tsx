import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { parseOptionsDraft } from "@/lib/form-builder-options";

export type InspectorFieldType = "text" | "wysiwyg" | "dropdown" | "multiselect" | "email" | "phone" | "file" | "date" | "number";
export type InspectorField = {
  id: string;
  recordId?: string;
  label: string;
  type: InspectorFieldType;
  locked?: boolean;
  required: boolean;
  maxChars?: number;
  options?: string[];
  showIf?: { fieldId: string; equals: string };
};

const fieldTypes: InspectorFieldType[] = ["text", "wysiwyg", "dropdown", "multiselect", "email", "phone", "file", "date", "number"];

// The single-field editor, opened in-flow when a row is clicked in a page's field list —
// replaces the old all-rows-expanded FieldRows layout, same BuilderField shape underneath.
// `conditionSources` are the other fields on this page eligible as a showIf target (already-
// saved dropdowns with options); the caller resolves this since it needs the full field list.
export function FieldInspector({ field, conditionSources, onChange, onClose }: {
  field: InspectorField | null;
  conditionSources: InspectorField[];
  onChange: (patch: Partial<InspectorField>) => void;
  onClose: () => void;
}) {
  if (!field) return null;
  const conditionSource = conditionSources.find((candidate) => candidate.recordId === field.showIf?.fieldId);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{field.locked ? "Locked field" : "Edit field"}</h3>
        <Button type="button" variant="ghost" size="icon" aria-label="Close field editor" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {field.locked ? (
        <p className="text-sm text-muted-foreground">
          This field is required by the platform and can't be edited or removed. Its label is shown for reference only.
        </p>
      ) : null}
      <FormField label="Label" htmlFor="field-inspector-label">
        <Input id="field-inspector-label" value={field.label} disabled={field.locked} onChange={(event) => onChange({ label: event.target.value })} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Type" htmlFor="field-inspector-type">
          <Select value={field.type} disabled={field.locked} onValueChange={(value) => onChange({ type: value as InspectorFieldType })}>
            <SelectTrigger id="field-inspector-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fieldTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <div className="flex items-center gap-3 pt-6">
          <Label htmlFor="field-inspector-required" className="text-sm font-normal">Required</Label>
          <Switch id="field-inspector-required" checked={field.required} disabled={field.locked} onCheckedChange={(required) => onChange({ required })} />
        </div>
      </div>
      {!field.locked && (
        <FormField label="Maximum characters" htmlFor="field-inspector-max">
          <Input id="field-inspector-max" type="number" min="1" value={field.maxChars ?? ""} onChange={(event) => onChange({ maxChars: event.target.value ? Number(event.target.value) : undefined })} />
        </FormField>
      )}
      {!field.locked && (field.type === "dropdown" || field.type === "multiselect") && (
        <FormField label="Options" htmlFor="field-inspector-options">
          <Textarea id="field-inspector-options" value={field.options?.join("\n") ?? ""} onChange={(event) => onChange({ options: parseOptionsDraft(event.target.value) })} />
          <p className="text-xs text-muted-foreground">One option per line.</p>
        </FormField>
      )}
      {!field.locked && (
        <FormField label="Show only if">
          <div className="flex flex-wrap gap-2">
            <Select
              value={field.showIf?.fieldId ?? "always"}
              onValueChange={(value) => onChange(value === "always" ? { showIf: undefined } : { showIf: { fieldId: value, equals: conditionSources.find((candidate) => candidate.recordId === value)?.options?.[0] ?? "" } })}
            >
              <SelectTrigger className="w-56" aria-label={`${field.label} condition field`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="always">Always show</SelectItem>
                {conditionSources.map((candidate) => <SelectItem key={candidate.recordId} value={candidate.recordId!}>{candidate.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {field.showIf && conditionSource && (
              <>
                <span className="self-center text-sm text-muted-foreground">equals</span>
                <Select value={field.showIf.equals} onValueChange={(value) => onChange({ showIf: { fieldId: field.showIf!.fieldId, equals: value } })}>
                  <SelectTrigger className="w-44" aria-label={`${field.label} condition value`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(conditionSource.options ?? []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </FormField>
      )}
    </div>
  );
}
