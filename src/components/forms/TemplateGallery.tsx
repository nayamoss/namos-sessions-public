import { LoaderCircle, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { FORM_TEMPLATES, type FormTemplate } from "@/components/forms/formTemplates";
import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";

type TemplateGalleryProps = ({
  appliesTo: "cfp" | "portal";
  templates?: FormTemplate[];
} | {
  appliesTo?: "cfp" | "portal";
  templates: FormTemplate[];
}) & {
  onSelect: (templateId: string) => void | Promise<void>;
  onBlank: () => void;
  onCancel: () => void;
  loading?: boolean;
};

function kindLabel(kind: string) {
  return kind.replaceAll("_", " ").replace(/^./, character => character.toUpperCase());
}

export function TemplateGallery({ appliesTo, templates: suppliedTemplates, onSelect, onBlank, onCancel, loading = false }: TemplateGalleryProps) {
  const templates = useMemo(() => {
    const catalog = suppliedTemplates ?? FORM_TEMPLATES;
    return appliesTo ? catalog.filter(template => template.appliesTo === appliesTo) : catalog;
  }, [appliesTo, suppliedTemplates]);
  const [loadingId, setLoadingId] = useState<string>();
  const [error, setError] = useState<string>();
  const isLoading = loading || loadingId !== undefined;

  const selectTemplate = async (templateId: string) => {
    if (isLoading) return;
    setError(undefined);
    setLoadingId(templateId);
    try {
      await onSelect(templateId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a form from this template.");
    } finally {
      setLoadingId(undefined);
    }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold">Choose a template</h2>
        <p className="mt-1 text-sm text-muted-foreground">Start from a template or build from scratch.</p>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={isLoading} onClick={onCancel}>Cancel</Button>
    </div>

    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

    <div className="grid gap-4 md:grid-cols-3" aria-busy={isLoading}>
      {templates.map(template => {
        const Icon = template.icon;
        const selected = loadingId === template.id;
        return <button
          key={template.id}
          type="button"
          disabled={isLoading}
          onClick={() => void selectTemplate(template.id)}
          className={cardSurfaceClasses("default", "flex min-h-44 flex-col p-5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60")}
        >
          <div className="flex items-start justify-between gap-3">
            <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            {selected && <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Creating form" />}
          </div>
          <p className="mt-4 font-semibold">{template.name}</p>
          <p className="mt-1 flex-1 text-sm leading-5 text-muted-foreground">{template.description}</p>
          <span className="mt-4 w-fit rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{kindLabel(template.kind)}</span>
        </button>;
      })}

      <button
        type="button"
        disabled={isLoading}
        onClick={onBlank}
        className={cardSurfaceClasses("default", "flex min-h-44 flex-col bg-muted/40 p-5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60")}
      >
        <Plus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <p className="mt-4 font-semibold">Start from blank</p>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">Build a form with no pre-filled fields.</p>
      </button>
    </div>
  </div>;
}
