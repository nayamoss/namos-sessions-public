import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { TemplateGallery } from "@/components/forms/TemplateGallery";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { StatusTabs } from "@/components/shared/StatusTabs";
import { useRepo } from "@/data/repo";
import type { EventId, Submission, SubmissionForm } from "@/data/types";

type FormStatus = "all" | "open" | "closed";
type FormRow = SubmissionForm & {
  status: Exclude<FormStatus, "all">;
  submissions: number;
  drafts: number;
};

function createRows(forms: SubmissionForm[], submissions: Submission[]) {
  return forms
    .filter((form) => {
      const kind = (form as SubmissionForm & { kind?: string }).kind;
      return kind === undefined || kind === "abstract" || kind === "session";
    })
    .map((form) => {
      const matchingSubmissions = submissions.filter(
        (submission) => submission.formId === form.id,
      );
      return {
        ...form,
        status: form.isOpen ? "open" : "closed",
        submissions: matchingSubmissions.filter(
          (submission) => submission.status !== "draft",
        ).length,
        drafts: matchingSubmissions.filter(
          (submission) => submission.status === "draft",
        ).length,
      } satisfies FormRow;
    });
}

export default function SubmissionForms() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const navigate = useNavigate();
  const [status, setStatus] = useState<FormStatus>("all");
  const [forms, setForms] = useState<FormRow[]>([]);
  const [eventId, setEventId] = useState<EventId>();
  const [showGallery, setShowGallery] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();

  const loadForms = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const event = activeEvent;
      if (!event) {
        setEventId(undefined);
        setForms([]);
        return;
      }
      setEventId(event.id);
      const scope = { eventId: event.id };
      const [forms, submissions] = await Promise.all([
        repo.forms.list(scope),
        repo.submissions.list(scope),
      ]);
      setForms(createRows(forms, submissions));
    } catch (error) {
      setForms([]);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load submission forms.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeEvent, repo]);

  useEffect(() => {
    void loadForms();
  }, [loadForms]);

  const visible = useMemo(
    () =>
      status === "all" ? forms : forms.filter((form) => form.status === status),
    [forms, status],
  );
  const openCount = forms.filter((form) => form.isOpen).length;
  const closedCount = forms.length - openCount;

  const selectTemplate = async (templateId: string) => {
    if (!eventId)
      throw new Error("Create an event before creating a submission form.");
    const formId = await repo.forms.createFromTemplate(templateId, eventId);
    navigate(`/events/${activeEvent.slug}/program/forms/${formId}/edit`);
  };

  if (showGallery)
    return (
      <AppLayout title="Submission Forms">
        <TemplateGallery
          appliesTo="cfp"
          onSelect={selectTemplate}
          onBlank={() => navigate(`/events/${activeEvent.slug}/program/forms/new/edit`)}
          onCancel={() => setShowGallery(false)}
        />
      </AppLayout>
    );

  return (
    <AppLayout title="Submission Forms">
      <div className="space-y-3">
        {loadError && (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        )}
        <ContentToolbar
          ariaLabel="Submission form controls"
          utilities={
            <StatusTabs
              ariaLabel="Submission form statuses"
              value={status}
              onValueChange={(value) => setStatus(value as FormStatus)}
              tabs={[
                { value: "all", label: "All", count: forms.length },
                { value: "open", label: "Open", count: openCount },
                { value: "closed", label: "Closed", count: closedCount },
              ]}
            />
          }
          primaryAction={
            <Button
              type="button"
              variant="accent"
              size="sm"
              onClick={() => setShowGallery(true)}
            >
              + Add
            </Button>
          }
        />
        {loading ? (
          <SkeletonList rows={4} label="Loading submission forms…" />
        ) : visible.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {visible.map((form) => (
              <Link
                key={form.id}
                to={`/events/${activeEvent.slug}/program/forms/${form.id}/edit`}
                className={cardSurfaceClasses("default", "p-6")}
              >
                <p className="text-base font-semibold">{form.name}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {form.status === "open" ? "Open" : "Closed"} ·{" "}
                  {form.submissions} submissions · {form.drafts} drafts
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className={cardSurfaceClasses("default", "p-8 text-center")}>
            <p className="font-medium">No submission forms in this view</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a form to start collecting proposals for this event.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
