import { useCallback, useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button } from "@/components/ui/button";
import { Card, cardSurfaceClasses } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRepo } from "@/data/repo";
import type { CommTemplate, CommTemplateKind } from "@/data/types";
import { resolveCommTemplate } from "@/lib/comms-template-tokens";

export const templateKinds: Array<{ value: CommTemplateKind; label: string }> = [
  { value: "submission_confirmation", label: "Submission confirmation" },
  { value: "acceptance", label: "Acceptance" },
  { value: "rejection", label: "Rejection" },
  { value: "consolidated_decision", label: "Consolidated decision" },
  { value: "reminder", label: "Reminder" },
  { value: "calendar_invite", label: "Calendar invite" },
  { value: "custom", label: "Custom" },
];

type TemplateDraft = Pick<CommTemplate, "name" | "kind" | "subject" | "body"> & {
  id?: string;
};
const emptyTemplate: TemplateDraft = {
  name: "",
  kind: "custom",
  subject: "",
  body: "",
};

export default function CommTemplateEditor() {
  const { id = "new" } = useParams();
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const [draft, setDraft] = useState<TemplateDraft>(emptyTemplate);
  const [templateContexts, setTemplateContexts] = useState<
    Array<{ id: string; title: string; speakerName: string }>
  >([]);
  const [templateContextId, setTemplateContextId] = useState("");
  const [eventName, setEventName] = useState("Your event");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!activeEvent) return;
    setLoading(true);
    try {
      const eventId = activeEvent.id;
      setEventName(activeEvent.name);
      const [templates, submissions, speakers] = await Promise.all([
        repo.comms.listTemplates({ eventId }),
        repo.submissions.list({ eventId }),
        repo.speakers.list({ eventId }),
      ]);
      const speakerNames = new Map(
        speakers.map((speaker) => [speaker.id, speaker.name]),
      );
      const contexts = submissions
        .filter(
          (submission) =>
            submission.status === "accepted" || submission.status === "declined",
        )
        .map((submission) => ({
          id: submission.id,
          title: submission.title?.trim() || "Untitled session",
          speakerName:
            speakerNames.get(submission.speakerIds[0]) ?? "Speaker",
        }));
      setTemplateContexts(contexts);
      setTemplateContextId(contexts[0]?.id ?? "");
      if (id !== "new") {
        const existing = templates.find((template) => template.id === id);
        if (existing) setDraft({ ...existing });
        else setMessage("This template could not be found.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load this template.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeEvent, id, repo]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedContext = templateContexts.find(
    (context) => context.id === templateContextId,
  );
  const portalUrl =
    typeof window === "undefined" ? "/portal" : `${window.location.origin}/portal`;
  const preview = {
    subject: resolveCommTemplate(draft.subject, {
      speakerName: selectedContext?.speakerName ?? "Speaker",
      eventName,
      sessionTitle: selectedContext?.title ?? "Your session",
      portalUrl,
    }),
    body: resolveCommTemplate(draft.body, {
      speakerName: selectedContext?.speakerName ?? "Speaker",
      eventName,
      sessionTitle: selectedContext?.title ?? "Your session",
      portalUrl,
    }),
  };
  const previewBody = DOMPurify.sanitize(preview.body);

  const save = async () => {
    if (!activeEvent) return;
    if (!draft.name.trim() || !draft.subject.trim() || !draft.body.trim()) {
      setMessage("Add a name, subject, and body before saving.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const savedId = await repo.comms.saveTemplate({
        ...draft,
        eventId: activeEvent.id,
      });
      // Keep the id in state (not the URL) so a second save on a freshly created
      // template updates the same record instead of creating another one. The
      // URL stays on .../new/edit for this visit; navigating back into the
      // library and reopening the template lands on its real id.
      setDraft((current) => ({ ...current, id: savedId }));
      setMessage("Template saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save the template.",
      );
    } finally {
      setSaving(false);
    }
  };

  const backLink = activeEvent
    ? `/events/${activeEvent.slug}/program/communications`
    : "#";

  return (
    <AppLayout title={id === "new" ? "New template" : draft.name || "Edit template"}>
      <div className="space-y-4">
        <ContentToolbar
          ariaLabel="Template editor actions"
          utilities={
            <Button variant="ghost" size="sm" asChild>
              <Link to={backLink}>
                <ArrowLeft className="h-4 w-4" />
                Back to templates
              </Link>
            </Button>
          }
          primaryAction={
            <Button variant="accent" size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save template"}
            </Button>
          }
        />
        {loading ? (
          <SkeletonList rows={4} label="Loading template…" />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <Card className="space-y-4 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Template name</Label>
                  <Input
                    id="template-name"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-kind">Message type</Label>
                  <Select
                    value={draft.kind}
                    onValueChange={(kind) =>
                      setDraft((current) => ({
                        ...current,
                        kind: kind as CommTemplateKind,
                      }))
                    }
                  >
                    <SelectTrigger id="template-kind" aria-label="Message type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {templateKinds.map((kind) => (
                        <SelectItem key={kind.value} value={kind.value}>
                          {kind.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-subject">Subject</Label>
                <Input
                  id="template-subject"
                  value={draft.subject}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, subject: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label id="template-body-label">Body</Label>
                <RichTextEditor
                  value={draft.body}
                  onChange={(body) =>
                    setDraft((current) => ({ ...current, body }))
                  }
                  ariaLabel="Template body"
                  ariaLabelledBy="template-body-label"
                  placeholder="Write the message your recipients should receive…"
                />
              </div>
              {message && (
                <p role="status" className="text-sm text-muted-foreground">
                  {message}
                </p>
              )}
            </Card>
            <aside className={cardSurfaceClasses("default", "space-y-3 p-5")}>
              <div className="space-y-2">
                <Label htmlFor="template-preview-context">Preview with</Label>
                <Select value={templateContextId} onValueChange={setTemplateContextId}>
                  <SelectTrigger id="template-preview-context">
                    <SelectValue placeholder="Example speaker and session" />
                  </SelectTrigger>
                  <SelectContent>
                    {templateContexts.map((context) => (
                      <SelectItem key={context.id} value={context.id}>
                        {context.speakerName} · {context.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Uses the same token resolver as delivery. Schedule-only tokens
                  populate in the send review when an agenda item is selected.
                </p>
              </div>
              <div className="rounded-lg bg-background p-4">
                <p className="text-sm font-medium">
                  {preview.subject || "Subject preview"}
                </p>
                {preview.body ? (
                  <div
                    className="mt-2 text-sm text-muted-foreground [&_a]:underline [&_h2]:mt-4 [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: previewBody }}
                  />
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Body preview</p>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
