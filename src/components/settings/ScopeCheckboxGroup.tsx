import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { ApiScope } from "@/data/types";

const resources: Array<{ label: string; read: ApiScope; write?: ApiScope }> = [
  { label: "Events", read: "events:read" }, { label: "Submissions", read: "submissions:read", write: "submissions:write" },
  { label: "Speakers", read: "speakers:read" }, { label: "Schedule", read: "agenda:read" }, { label: "Tasks", read: "tasks:read" },
];
export function ScopeCheckboxGroup({ value, onChange, showValidation }: { value: ApiScope[]; onChange: (scopes: ApiScope[]) => void; showValidation?: boolean }) {
  const toggle = (scope: ApiScope, checked: boolean) => onChange(checked ? [...new Set([...value, scope])] : value.filter((item) => item !== scope));
  return <fieldset className="space-y-3"><div className="flex items-center justify-between"><legend className="text-sm font-medium">Permissions</legend><Button type="button" variant="ghost" size="sm" className="h-auto p-0 underline underline-offset-4" onClick={() => onChange(resources.map((resource) => resource.read))}>Select all read-only</Button></div>
    {resources.map((resource) => <div key={resource.read} className={cardSurfaceClasses("default", "flex items-center justify-between px-3 py-2")}><span className="text-sm font-medium">{resource.label}</span><div className="flex gap-4 text-sm"><label className="flex items-center gap-2"><Checkbox checked={value.includes(resource.read)} onCheckedChange={(checked) => toggle(resource.read, checked === true)} />Read</label>{resource.write ? <label className="flex items-center gap-2"><Checkbox checked={value.includes(resource.write)} onCheckedChange={(checked) => toggle(resource.write!, checked === true)} />Write</label> : <span className="text-muted-foreground">Write unavailable</span>}</div></div>)}
    {showValidation && !value.length && <p className="text-sm text-destructive">Select at least one permission</p>}</fieldset>;
}
