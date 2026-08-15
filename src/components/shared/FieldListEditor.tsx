import { GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { DynamicField } from "./DynamicFormRenderer";

export function FieldListEditor({ fields, onChange }: { fields: DynamicField[]; onChange: (fields: DynamicField[]) => void }) { const update = (index: number, field: DynamicField) => onChange(fields.map((item, position) => position === index ? field : item)); return <div className="space-y-2">{fields.map((field, index) => <div key={field.id} className={cardSurfaceClasses("default", "flex items-center gap-3 p-4")}><GripVertical className="h-4 w-4 text-muted-foreground" aria-hidden /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{field.label}</p><p className="text-xs text-muted-foreground">{field.type}</p></div><label className="flex items-center gap-2 text-sm text-muted-foreground">Required<Switch checked={field.required} onCheckedChange={required => update(index, { ...field, required })} /></label><Button variant="ghost" size="icon" aria-label={`Remove ${field.label}`} onClick={() => onChange(fields.filter(item => item.id !== field.id))}><Trash2 className="h-4 w-4" /></Button></div>)}</div>; }
import { cardSurfaceClasses } from "@/components/ui/card";
