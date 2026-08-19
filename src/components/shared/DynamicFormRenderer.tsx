import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DynamicField = {
  id: string;
  label: string;
  type: "text" | "textarea" | "email" | "number" | "select";
  required?: boolean;
  maxChars?: number;
  options?: string[];
  showIf?: { fieldId: string; equals: string };
};

export function isFieldVisible(
  field: DynamicField,
  values: Record<string, string>,
) {
  return !field.showIf || values[field.showIf.fieldId] === field.showIf.equals;
}

export function DynamicFormRenderer({
  fields,
  values,
  onChange,
}: {
  fields: DynamicField[];
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      {fields
        .filter((field) => isFieldVisible(field, values))
        .map((field) => (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span aria-hidden="true"> *</span>}
            </Label>
            {field.type === "textarea" ? (
              <Textarea
                id={field.id}
                required={field.required}
                maxLength={field.maxChars}
                value={values[field.id] ?? ""}
                onChange={(event) => onChange(field.id, event.target.value)}
              />
            ) : field.type === "select" ? (
              <Select
                value={values[field.id] ?? ""}
                onValueChange={(value) => onChange(field.id, value)}
              >
                <SelectTrigger id={field.id}>
                  <SelectValue
                    placeholder={`Select ${field.label.toLowerCase()}`}
                  />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={field.id}
                type={field.type}
                required={field.required}
                maxLength={field.maxChars}
                value={values[field.id] ?? ""}
                onChange={(event) => onChange(field.id, event.target.value)}
              />
            )}
            {field.maxChars !== undefined && field.type !== "select" && (
              <p className="text-right text-xs text-muted-foreground">
                {(values[field.id] ?? "").length} / {field.maxChars}
              </p>
            )}
          </div>
        ))}
    </div>
  );
}
