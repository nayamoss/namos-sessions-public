import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FilePlus2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { TemplateGallery } from "@/components/forms/TemplateGallery";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { FilterMenu } from "@/components/shared/StatusTabs";
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
  // ?new=true lands here from the command palette's "Create a CFP" action, so
  // the deep link opens the template gallery instead of just the list.
  const [params, setParams] = useSearchParams();
  const [showGallery, setShowGallery] = useState(() => params.get("new") === "true");
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

  // Navigating to ?new=true while already on this page must open the gallery
  // too — the initial state only runs on mount.
  useEffect(() => {
    if (params.get("new") === "true") setShowGallery(true);
  }, [params]);

  const closeGallery = useCallback(() => {
    setShowGallery(false);
    if (params.get("new")) setParams({}, { replace: true });
  }, [params, setParams]);

  const visible = useMemo(
    () =>
      status === "all" ? forms : forms.filter((form) => form.status === status),
    [forms, status],
  );
  const openCount = forms.filter((form) => form.isOpen).length;
  const closedCount = forms.length - openCount;
  const columns: DataGridColumn<FormRow>[] = [
    {
      key: "name",
      header: "Call for papers",
      cell: (form) => <span className="font-medium">{form.name}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (form) => <span className="capitalize">{form.status}</span>,
    },
  ];

  const selectTemplate = async (templateId: string) => {
    if (!eventId)
      throw new Error("Create an event before creating a submission form.");
    const formId = await repo.forms.createFromTemplate(templateId, eventId);
    navigate(`/events/${activeEvent.slug}/program/forms/${formId}/edit`);
  };

  if (showGallery)
    return (
      <AppLayout title="Calls for papers">
        <TemplateGallery
          appliesTo="cfp"
          onSelect={selectTemplate}
          onBlank={() => navigate(`/events/${activeEvent.slug}/program/forms/new/edit`)}
          onCancel={closeGallery}
        />
      </AppLayout>
    );

  return (
    <AppLayout title="Calls for papers">
      <div className="space-y-3">
        {loadError && (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        )}
        <ContentToolbar
          ariaLabel="Submission form controls"
          utilities={
            <FilterMenu
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
              Create a CFP
            </Button>
          }
        />
        {loading ? (
          <SkeletonList rows={4} label="Loading submission forms…" />
        ) : (
          <DataGrid
            rows={visible}
            columns={columns}
            ariaLabel="Calls for papers"
            getRowLabel={(form) => form.name}
            onRowActivated={(form) =>
              navigate(`/events/${activeEvent.slug}/program/forms/${form.id}/edit`)
            }
            empty={
              <EmptyState
                compact
                icon={FilePlus2}
                title={forms.length ? "No calls match this view" : "Create your first call for papers"}
                message={forms.length ? "Choose another status." : "Add a form when you are ready to collect proposals."}
                action={
                  forms.length ? (
                    <Button variant="outline" size="sm" onClick={() => setStatus("all")}>
                      Show all
                    </Button>
                  ) : (
                    <Button variant="accent" size="sm" onClick={() => setShowGallery(true)}>
                      Add call
                    </Button>
                  )
                }
              />
            }
          />
        )}
      </div>
    </AppLayout>
  );
}
