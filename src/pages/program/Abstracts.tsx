import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Columns3,
  ChevronDown,
  ChevronUp,
  Download,
  LayoutGrid,
  Search,
  Table2,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { DecisionButtons } from "@/components/shared/DecisionButtons";
import { SubmissionStatusBadge } from "@/components/shared/SubmissionStatusBadge";
import { StarRating } from "@/components/shared/StarRating";
import { FilterMenu } from "@/components/shared/StatusTabs";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useRepo } from "@/data/repo";
import type {
  Comm,
  CommPreview,
  CommSendRecipientResult,
  Evaluation,
  Event,
  FieldDefinition,
  Speaker,
  Submission,
  SubmissionForm,
  SubmissionStatus,
  Tag,
  TagId,
} from "@/data/types";
import { filterSubmissionsByStatus } from "@/lib/submission-filters";
import { weightedTotal } from "@/lib/evaluation-score";
import { friendlyErrorMessage } from "@/lib/errors";
import {
  ABSTRACT_GRID_PREFERENCES_KEY,
  defaultAbstractGridPreferences,
  moveAbstractGridColumn,
  normalizeAbstractGridPreferences,
  toggleAbstractGridColumn,
  type AbstractGridPreferences,
} from "@/lib/abstract-grid-preferences";

type AbstractRow = {
  id: string;
  formId: string;
  status: SubmissionStatus;
  source: string;
  title: string;
  description: string;
  speaker: string;
  track: string;
  tagIds: TagId[];
  tags: Tag[];
  email?: string;
  speakerId?: string;
  rating?: number;
  notified: boolean;
};

type SubmissionDocument = Submission & {
  title?: string;
  speakerId?: string;
  answers?: Record<string, unknown>;
};

type CommDocument = Comm & { submissionId?: string; status?: string };
type AbstractDraft = {
  formId: string;
  title: string;
  description: string;
  status: SubmissionStatus;
};

type SubmissionViewMode = "table" | "kanban" | "grid";

const SUBMISSIONS_VIEW_MODE_KEY = "namos-submissions-view-mode";

const abstractColumnKeys = [
  "status",
  "source",
  "title",
  "description",
  "speaker",
  "track",
  "tags",
  "rating",
  "notified",
  "decision",
] as const;
const abstractColumnLabels: Record<
  (typeof abstractColumnKeys)[number],
  string
> = {
  status: "Status",
  source: "Source",
  title: "Title",
  description: "Description",
  speaker: "Speaker",
  track: "Track",
  tags: "Tags",
  rating: "Rating",
  notified: "Notified",
  decision: "Decision email",
};

const statusLabels: Record<SubmissionStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  accept_queue: "Accept Queue",
  accepted: "Accepted",
  maybe: "Maybe",
  decline_queue: "Decline Queue",
  declined: "Declined",
  withdrawn: "Withdrawn",
};
const submissionStatusOrder: SubmissionStatus[] = [
  "accepted",
  "accept_queue",
  "maybe",
  "pending",
  "decline_queue",
  "declined",
  "withdrawn",
  "draft",
];
const editableStatuses: SubmissionStatus[] = [
  "accepted",
  "accept_queue",
  "pending",
  "decline_queue",
  "declined",
];

// Dynamic-form answers aren't flat: `fieldValues` is keyed by opaque generated field ids, with
// a parallel `fieldLabels` map from id to the human label an organizer configured (e.g. "Abstract").
// A submission's `answers` object only has a handful of real flat keys (email, from the account
// step) — everything else must be resolved id -> label -> value. Try flat keys first (cheap, and
// covers the account-step fields), then fall back to a case-insensitive label match.
export function valueFromAnswers(
  answers: Record<string, unknown> | undefined,
  keys: string[],
  preferredFieldIds: string[] = [],
) {
  for (const key of keys) {
    const value = answers?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  const fieldLabels = answers?.fieldLabels;
  const fieldValues = answers?.fieldValues;
  if (isRecord(fieldLabels) && isRecord(fieldValues)) {
    // New public submissions persist the exact opaque field id that the CFP renderer used for
    // its abstract body. Form labels are organizer copy, never an application contract.
    for (const fieldId of preferredFieldIds) {
      const value = fieldValues[fieldId];
      if (typeof value === "string" && value.trim()) return value;
    }
    const wanted = new Set(keys.map((key) => key.toLowerCase()));
    for (const [fieldId, label] of Object.entries(fieldLabels)) {
      if (typeof label !== "string" || !wanted.has(label.toLowerCase()))
        continue;
      const value = fieldValues[fieldId];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidEmail(value: string | undefined) {
  return Boolean(value && /^\S+@\S+\.\S+$/.test(value));
}

function legacyAbstractFieldIds(
  form: SubmissionForm | undefined,
  fieldsById: Map<string, FieldDefinition>,
) {
  const ids =
    form?.sections?.find((section) => section.key === "abstract")?.fieldIds ??
    [];
  // Existing submissions predate abstractFieldId. Their form section is stable, and rich-text
  // fields are the intended abstract body regardless of the organizer's visible label.
  return ids.filter((id) => fieldsById.get(id)?.type === "wysiwyg");
}

export function createRows({
  submissions,
  speakers,
  evaluations,
  forms,
  fields,
  comms,
  tags,
}: {
  submissions: SubmissionDocument[];
  speakers: Speaker[];
  evaluations: Evaluation[];
  forms: SubmissionForm[];
  fields: FieldDefinition[];
  comms: CommDocument[];
  tags: Tag[];
}) {
  const speakersById = new Map(
    speakers.map((speaker) => [speaker.id, speaker.name]),
  );
  const formNames = new Map(forms.map((form) => [form.id, form.name]));
  const formsById = new Map(forms.map((form) => [form.id, form]));
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
  const scoresBySubmission = new Map<string, number[]>();
  evaluations.forEach((evaluation) => {
    // A scorecard review (issue #56) records no single score — its rating is the weighted total
    // over the criteria it was scored against. A legacy review still contributes its `score`.
    const total =
      weightedTotal(
        evaluation.criteria,
        evaluation.criteriaScores,
        evaluation.scoringScaleMax ?? 5,
      ) ?? evaluation.score;
    if (typeof total !== "number") return;
    const scores = scoresBySubmission.get(evaluation.submissionId) ?? [];
    scores.push(total);
    scoresBySubmission.set(evaluation.submissionId, scores);
  });
  const notifiedSubmissionIds = new Set(
    comms
      .filter((comm) => comm.status === "sent")
      .map((comm) => comm.submissionId)
      .filter((id): id is string => Boolean(id)),
  );

  return submissions.map((submission) => {
    const answers = submission.answers;
    const storedAbstractFieldId =
      typeof answers?.abstractFieldId === "string"
        ? answers.abstractFieldId
        : undefined;
    const abstractFieldIds = storedAbstractFieldId
      ? [storedAbstractFieldId]
      : legacyAbstractFieldIds(formsById.get(submission.formId), fieldsById);
    const scores = scoresBySubmission.get(submission.id) ?? [];
    const speakerId = submission.speakerId ?? submission.speakerIds[0];
    return {
      id: submission.id,
      formId: submission.formId,
      status: submission.status,
      source: formNames.get(submission.formId) ?? "Submission form",
      title:
        submission.title?.trim() ||
        valueFromAnswers(answers, ["title", "sessionTitle"]) ||
        "Untitled submission",
      description:
        valueFromAnswers(
          answers,
          ["abstract", "description", "summary"],
          abstractFieldIds,
        ) || "—",
      speaker: speakerId
        ? (speakersById.get(speakerId as never) ?? "Unknown speaker")
        : "Unassigned",
      speakerId,
      email: valueFromAnswers(answers, ["email", "contactEmail"]),
      track: valueFromAnswers(answers, ["track", "topic"]) || "—",
      tagIds: submission.tagIds,
      tags: submission.tagIds.flatMap((tagId) => tagsById.get(tagId) ?? []),
      rating: scores.length
        ? scores.reduce((total, score) => total + score, 0) / scores.length
        : undefined,
      notified: notifiedSubmissionIds.has(submission.id),
    } satisfies AbstractRow;
  });
}

function downloadCsv(rows: AbstractRow[]) {
  const quote = (value: string | number | boolean | undefined) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    [
      "Status",
      "Source",
      "Title",
      "Description",
      "Speaker",
      "Track",
      "Tags",
      "Rating",
      "Notified",
    ],
    ...rows.map((row) => [
      statusLabels[row.status],
      row.source,
      row.title,
      row.description,
      row.speaker,
      row.track,
      row.tags.map((tag) => tag.name).join("; "),
      row.rating ?? "",
      row.notified ? "Yes" : "No",
    ]),
  ]
    .map((row) => row.map(quote).join(","))
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "abstracts.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function TagsCell({
  row,
  library,
  saving,
  onChange,
}: {
  row: AbstractRow;
  library: Tag[];
  saving: boolean;
  onChange: (tagIds: TagId[]) => void;
}) {
  const selected = new Set(row.tagIds);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-auto min-h-8 max-w-full justify-start px-2 py-1"
          disabled={saving}
          onClick={(click) => click.stopPropagation()}
        >
          <span className="truncate">
            {row.tags.length
              ? row.tags.map((tag) => tag.name).join(", ")
              : "Add tags"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 space-y-2 p-3"
        onClick={(click) => click.stopPropagation()}
      >
        <div>
          <p className="text-sm font-medium">Assign tags</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Changes save immediately for this submission.
          </p>
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {library.map((tag) => (
            <label
              key={tag.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={selected.has(tag.id)}
                disabled={saving}
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true
                      ? [...row.tagIds, tag.id]
                      : row.tagIds.filter((tagId) => tagId !== tag.id),
                  )
                }
              />
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground"
                style={tag.color ? { backgroundColor: tag.color } : undefined}
                aria-hidden="true"
              />
              <span className="truncate">{tag.name}</span>
            </label>
          ))}
          {!library.length && (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              Add tags in Settings → Library first.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function loadColumnPreferences() {
  const fallback = defaultAbstractGridPreferences(abstractColumnKeys);
  try {
    return normalizeAbstractGridPreferences(
      JSON.parse(
        window.localStorage.getItem(ABSTRACT_GRID_PREFERENCES_KEY) ?? "null",
      ),
      abstractColumnKeys,
    );
  } catch {
    return fallback;
  }
}

function loadViewMode(): SubmissionViewMode {
  try {
    const stored = window.localStorage.getItem(SUBMISSIONS_VIEW_MODE_KEY);
    return stored === "kanban" || stored === "grid" ? stored : "table";
  } catch {
    return "table";
  }
}

function SubmissionViewToggle({
  value,
  onChange,
}: {
  value: SubmissionViewMode;
  onChange: (value: SubmissionViewMode) => void;
}) {
  const options = [
    { value: "table", label: "Table", icon: Table2 },
    { value: "kanban", label: "Kanban", icon: Columns3 },
    { value: "grid", label: "Grid", icon: LayoutGrid },
  ] as const;

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as SubmissionViewMode);
      }}
      size="sm"
      aria-label="Submission view"
      className="rounded-md bg-muted/60 p-0.5"
    >
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={`${option.label} view`}
            className="h-7 gap-1.5 px-2.5 data-[state=on]:bg-card"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{option.label}</span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

function SubmissionCard({
  row,
  onOpen,
  compact = false,
}: {
  row: AbstractRow;
  onOpen: (row: AbstractRow) => void;
  compact?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onOpen(row)}
      className={cardSurfaceClasses(
        "default",
        `block h-auto w-full min-w-0 whitespace-normal text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30 ${compact ? "p-3" : "p-4"}`,
      )}
      aria-label={`Open ${row.title}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <h3 className="line-clamp-2 min-w-0 text-sm font-semibold leading-5">
          {row.title}
        </h3>
        <SubmissionStatusBadge
          status={row.status}
          label={statusLabels[row.status]}
          className="shrink-0"
        />
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">
        {row.source}
      </p>
      <dl className={`grid gap-x-3 gap-y-1 text-xs ${compact ? "mt-3 grid-cols-1" : "mt-4 grid-cols-2"}`}>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Speaker</dt>
          <dd className="mt-0.5 truncate text-foreground">{row.speaker}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Track</dt>
          <dd className="mt-0.5 truncate text-foreground">{row.track}</dd>
        </div>
      </dl>
    </Button>
  );
}

function ColumnsControl({
  preferences,
  onChange,
}: {
  preferences: AbstractGridPreferences;
  onChange: (next: AbstractGridPreferences) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = preferences.order.filter((key) =>
    abstractColumnLabels[key as keyof typeof abstractColumnLabels]
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const visibleCount = preferences.order.length - preferences.hidden.length;
  const update = (next: AbstractGridPreferences) =>
    onChange(normalizeAbstractGridPreferences(next, abstractColumnKeys));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Choose abstract columns"
        >
          Columns{" "}
          <span className="text-muted-foreground">
            {visibleCount}/{abstractColumnKeys.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-3">
        <div>
          <p className="text-sm font-medium">Columns</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose visible columns and set their order for this browser.
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Label className="sr-only" htmlFor="abstract-columns-search">
            Search columns
          </Label>
          <Input
            id="abstract-columns-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 pl-9"
            placeholder="Search columns"
          />
        </div>
        <div
          className="max-h-72 space-y-1 overflow-y-auto"
          aria-label="Selected columns"
        >
          {matches.map((key) => {
            const position = preferences.order.indexOf(key);
            const visible = !preferences.hidden.includes(key);
            return (
              <div
                key={key}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
              >
                <Checkbox
                  id={`abstract-column-${key}`}
                  checked={visible}
                  onCheckedChange={() =>
                    update(toggleAbstractGridColumn(preferences, key))
                  }
                  aria-label={`Show ${abstractColumnLabels[key as keyof typeof abstractColumnLabels]}`}
                />
                <Label
                  htmlFor={`abstract-column-${key}`}
                  className="min-w-0 flex-1 cursor-pointer text-sm"
                >
                  {
                    abstractColumnLabels[
                      key as keyof typeof abstractColumnLabels
                    ]
                  }
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() =>
                    update(moveAbstractGridColumn(preferences, key, -1))
                  }
                  disabled={position === 0}
                  aria-label={`Move ${abstractColumnLabels[key as keyof typeof abstractColumnLabels]} earlier`}
                >
                  <ChevronUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() =>
                    update(moveAbstractGridColumn(preferences, key, 1))
                  }
                  disabled={position === preferences.order.length - 1}
                  aria-label={`Move ${abstractColumnLabels[key as keyof typeof abstractColumnLabels]} later`}
                >
                  <ChevronDown />
                </Button>
              </div>
            );
          })}
          {!matches.length && (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              No columns match that search.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between pt-3">
          <span className="text-xs text-muted-foreground">
            {visibleCount} visible
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              update(defaultAbstractGridPreferences(abstractColumnKeys));
            }}
          >
            Reset to default
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function Abstracts() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const navigate = useNavigate();
  const { abstractId } = useParams<{ abstractId?: string }>();
  const location = useLocation();
  const creating = abstractId === "new" || location.pathname.endsWith("/new");
  const [searchParams, setSearchParams] = useSearchParams();
  const [event, setEvent] = useState<Event>();
  const [rows, setRows] = useState<AbstractRow[]>([]);
  const [forms, setForms] = useState<SubmissionForm[]>([]);
  const [tagLibrary, setTagLibrary] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [status, setStatus] = useState<SubmissionStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [sendingId, setSendingId] = useState<string>();
  const [preparingId, setPreparingId] = useState<string>();
  const [decisionPreview, setDecisionPreview] = useState<CommPreview>();
  const [decisionResults, setDecisionResults] = useState<
    CommSendRecipientResult[]
  >([]);
  const [taggingId, setTaggingId] = useState<string>();
  const [decisionFeedback, setDecisionFeedback] = useState<string>();
  const [updatingDecisionId, setUpdatingDecisionId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [editDraft, setEditDraft] = useState<{
    title: string;
    description: string;
  }>({ title: "", description: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string>();
  const [addOpen, setAddOpen] = useState(creating);
  useEffect(() => {
    if (creating) setAddOpen(true);
  }, [creating]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string>();
  const [draft, setDraft] = useState<AbstractDraft>({
    formId: "",
    title: "",
    description: "",
    status: "pending",
  });
  const [columnPreferences, setColumnPreferences] =
    useState<AbstractGridPreferences>(loadColumnPreferences);
  const [viewMode, setViewMode] =
    useState<SubmissionViewMode>(loadViewMode);

  const updateColumnPreferences = useCallback(
    (next: AbstractGridPreferences) => {
      const normalized = normalizeAbstractGridPreferences(
        next,
        abstractColumnKeys,
      );
      setColumnPreferences(normalized);
      try {
        window.localStorage.setItem(
          ABSTRACT_GRID_PREFERENCES_KEY,
          JSON.stringify(normalized),
        );
      } catch {
        /* Browser storage can be disabled; keep the in-memory choice. */
      }
    },
    [],
  );

  const updateViewMode = useCallback((next: SubmissionViewMode) => {
    setViewMode(next);
    try {
      window.localStorage.setItem(SUBMISSIONS_VIEW_MODE_KEY, next);
    } catch {
      /* Browser storage can be disabled; keep the in-memory choice. */
    }
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const event = activeEvent;
      if (!event) {
        setEvent(undefined);
        setRows([]);
        setForms([]);
        setTagLibrary([]);
        return;
      }
      setEvent(event);
      const scope = { eventId: event.id };
      const [submissions, speakers, evaluations, forms, fields, comms, tags] =
        await Promise.all([
          repo.submissions.list(scope),
          repo.speakers.list(scope),
          repo.evaluations.list(scope),
          repo.forms.list(scope),
          repo.forms.listFields(scope),
          repo.comms.list(scope),
          repo.tags.list(scope),
        ]);
      setForms(forms);
      setTagLibrary(tags);
      setRows(
        createRows({
          submissions: submissions as SubmissionDocument[],
          speakers,
          evaluations,
          forms,
          fields,
          comms: comms as CommDocument[],
          tags,
        }),
      );
    } catch (error) {
      setRows([]);
      setLoadError(friendlyErrorMessage(error, "Could not load abstracts."));
    } finally {
      setLoading(false);
    }
  }, [activeEvent, repo]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const visibleRows = useMemo(
    () =>
      filterSubmissionsByStatus(rows, status).filter((row) =>
        `${row.title} ${row.speaker} ${row.description} ${row.tags.map((tag) => tag.name).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query, rows, status],
  );
  const listPath = `/events/${activeEvent.slug}/program/abstracts`;
  const selectedId = abstractId && abstractId !== "new" ? abstractId : searchParams.get("selected");
  const selectedRow = useMemo(() => rows.find((row) => row.id === selectedId), [rows, selectedId]);
  useEffect(() => {
    if (abstractId || !searchParams.get("selected")) return;
    navigate(`${listPath}/${encodeURIComponent(searchParams.get("selected")!)}/edit`, { replace: true });
  }, [abstractId, listPath, navigate, searchParams]);
  useEffect(() => {
    if (!selectedRow || editingId === selectedRow.id) return;
    setEditingId(selectedRow.id);
    setEditDraft({
      title:
        selectedRow.title === "Untitled submission" ? "" : selectedRow.title,
      description: selectedRow.description === "—" ? "" : selectedRow.description,
    });
    setEditError(undefined);
  }, [editingId, selectedRow]);
  const editDirty = Boolean(
    selectedRow &&
      (editDraft.title !== (selectedRow.title === "Untitled submission" ? "" : selectedRow.title) ||
        editDraft.description !==
          (selectedRow.description === "—" ? "" : selectedRow.description)),
  );
  const saveAbstractEdits = async () => {
    if (!event || !selectedRow) return;
    if (!editDraft.title.trim()) {
      setEditError("A title is required.");
      return;
    }
    setSavingEdit(true);
    setEditError(undefined);
    try {
      await repo.submissions.update({
        eventId: event.id,
        id: selectedRow.id as Submission["id"],
        formId: selectedRow.formId,
        title: editDraft.title,
        description: editDraft.description || undefined,
        status: selectedRow.status,
      });
      await loadRows();
    } catch (error) {
      setEditError(
        error instanceof Error
          ? error.message
          : "Could not save the changes.",
      );
    } finally {
      setSavingEdit(false);
    }
  };
  const updateStatus = async (id: string, nextStatus: SubmissionStatus) => {
    const current = rows.find((row) => row.id === id);
    if (!current || current.status === nextStatus) return;
    setUpdatingDecisionId(id);
    setLoadError(undefined);
    setRows((previous) =>
      previous.map((row) =>
        row.id === id
          ? {
              ...row,
              status: nextStatus,
              notified: nextStatus === "accepted" ? row.notified : false,
            }
          : row,
      ),
    );
    try {
      if (nextStatus === "accepted" || nextStatus === "declined")
        await repo.submissions.decide(id, nextStatus);
      else await repo.submissions.setStatus(id, nextStatus);
    } catch (error) {
      setRows((previous) =>
        previous.map((row) => (row.id === id ? current : row)),
      );
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not update the abstract status.",
      );
    } finally {
      setUpdatingDecisionId(undefined);
    }
  };
  const updateTags = async (id: string, tagIds: TagId[]) => {
    if (!event || taggingId) return;
    const current = rows.find((row) => row.id === id);
    if (!current) return;
    const uniqueTagIds = [...new Set(tagIds)];
    const nextTags = tagLibrary.filter((tag) => uniqueTagIds.includes(tag.id));
    setTaggingId(id);
    setLoadError(undefined);
    setRows((previous) =>
      previous.map((row) =>
        row.id === id ? { ...row, tagIds: uniqueTagIds, tags: nextTags } : row,
      ),
    );
    try {
      await repo.submissions.setTags({
        eventId: event.id,
        submissionId: id as Submission["id"],
        tagIds: uniqueTagIds,
      });
    } catch (error) {
      setRows((previous) =>
        previous.map((row) => (row.id === id ? current : row)),
      );
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not update the abstract tags.",
      );
    } finally {
      setTaggingId(undefined);
    }
  };
  const prepareDecision = async (row: AbstractRow) => {
    if (!event || (row.status !== "accepted" && row.status !== "declined"))
      return;
    setPreparingId(row.id);
    setDecisionFeedback(undefined);
    setDecisionPreview(undefined);
    setDecisionResults([]);
    const next = new URLSearchParams(searchParams);
    next.set("selected", row.id);
    setSearchParams(next);
    try {
      setDecisionPreview(
        await repo.comms.previewDecision({
          eventId: event.id,
          submissionId: row.id,
        }),
      );
    } catch (cause) {
      setDecisionFeedback(
        cause instanceof Error
          ? `Could not prepare decision: ${cause.message}`
          : "Could not prepare the decision email.",
      );
    } finally {
      setPreparingId(undefined);
    }
  };
  const sendDecision = async (
    row: AbstractRow,
    recipientSpeakerIds?: string[],
  ) => {
    if (!event || !decisionPreview) return;
    setSendingId(row.id);
    setDecisionFeedback(undefined);
    try {
      const outcome = await repo.comms.sendDecision({
        eventId: event.id,
        submissionId: row.id,
        recipientSpeakerIds,
      });
      setDecisionResults((current) =>
        recipientSpeakerIds?.length
          ? [
              ...current.filter(
                (result) =>
                  !recipientSpeakerIds.includes(result.speakerId ?? ""),
              ),
              ...outcome.results,
            ]
          : outcome.results,
      );
      if (outcome.sent)
        setRows((current) =>
          current.map((item) =>
            item.id === row.id ? { ...item, notified: true } : item,
          ),
        );
      if (outcome.status === "sent") {
        setDecisionFeedback(
          `Decision sent to ${outcome.sent} recipient${outcome.sent === 1 ? "" : "s"}.`,
        );
        return;
      }
      const firstProblem = outcome.results.find(
        (result) => result.error || result.reason,
      );
      setDecisionFeedback(
        `Decision delivery finished with ${outcome.failed} failed and ${outcome.skipped} skipped.${firstProblem ? ` ${firstProblem.error ?? firstProblem.reason}` : ""}`,
      );
    } catch (cause) {
      setDecisionFeedback(
        cause instanceof Error
          ? `Decision email failed: ${cause.message}`
          : "Decision email could not be sent.",
      );
    } finally {
      setSendingId(undefined);
    }
  };
  const openAddAbstract = () => {
    setAddError(undefined);
    setDraft({
      formId: forms[0]?.id ?? "",
      title: "",
      description: "",
      status: "pending",
    });
    setAddOpen(true);
    navigate(`${listPath}/new`);
  };
  const createAbstract = async () => {
    if (!event) return;
    if (!draft.formId) {
      setAddError(
        "Create a call for papers first — submissions attach to a CFP form.",
      );
      return;
    }
    if (!draft.title.trim()) {
      setAddError("A title is required.");
      return;
    }
    setAdding(true);
    setAddError(undefined);
    try {
      const created = await repo.submissions.createAdmin({
        eventId: event.id,
        formId: draft.formId,
        title: draft.title,
        description: draft.description || undefined,
        status: draft.status,
      });
      await loadRows();
      navigate(`${listPath}/${created.id}/edit`);
    } catch (error) {
      setAddError(
        error instanceof Error
          ? error.message
          : "Could not create the abstract.",
      );
    } finally {
      setAdding(false);
    }
  };
  const tabs = (["all", ...submissionStatusOrder] as const).map((value) => ({
    value,
    label: value === "all" ? "All submissions" : statusLabels[value],
    count:
      value === "all"
        ? rows.length
        : rows.filter((row) => row.status === value).length,
  }));
  const allColumns: DataGridColumn<AbstractRow>[] = [
    {
      key: "status",
      width: "18rem",
      header: "Status",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <DecisionButtons
            status={row.status}
            pending={updatingDecisionId === row.id}
            onDecide={(next) => void updateStatus(row.id, next)}
          />
          {editableStatuses.includes(row.status) ? (
            <Select
              value={row.status}
              onValueChange={(value) =>
                void updateStatus(row.id, value as SubmissionStatus)
              }
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {editableStatuses.map((option) => (
                  <SelectItem key={option} value={option}>
                    {statusLabels[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm text-muted-foreground">
              {statusLabels[row.status]}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "source",
      width: "10rem",
      header: "Source",
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {row.source}
        </span>
      ),
    },
    {
      key: "title",
      width: "20rem",
      header: "Title",
      cell: (row) => <span className="font-medium">{row.title}</span>,
    },
    {
      key: "description",
      width: "18rem",
      header: "Description",
      cell: (row) => (
        <span className="line-clamp-2 min-w-64 text-muted-foreground">
          {row.description}
        </span>
      ),
    },
    {
      key: "speaker",
      width: "10rem",
      header: "Speaker",
      cell: (row) => row.speaker,
    },
    {
      key: "track",
      width: "8rem",
      header: "Track",
      cell: (row) => <span className="text-muted-foreground">{row.track}</span>,
    },
    {
      key: "tags",
      width: "12rem",
      header: "Tags",
      cell: (row) => (
        <TagsCell
          row={row}
          library={tagLibrary}
          saving={Boolean(taggingId)}
          onChange={(tagIds) => void updateTags(row.id, tagIds)}
        />
      ),
    },
    {
      key: "rating",
      width: "8rem",
      header: "Rating",
      cell: (row) => (
        <StarRating
          value={row.rating}
          max={5}
          label="Aggregate rating"
          size="sm"
        />
      ),
    },
    {
      key: "notified",
      width: "7rem",
      header: "Notified",
      cell: (row) => (row.notified ? "Yes" : "No"),
    },
    {
      key: "decision",
      width: "9rem",
      header: "Decision email",
      cell: (row) =>
        row.status === "accepted" || row.status === "declined" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={preparingId === row.id}
            onClick={(click) => {
              click.stopPropagation();
              void prepareDecision(row);
            }}
          >
            {preparingId === row.id ? "Preparing…" : "Send decision"}
          </Button>
        ) : (
          <span className="text-muted-foreground">Decide first</span>
        ),
    },
  ];
  const byColumnKey = new Map(allColumns.map((column) => [column.key, column]));
  const columns = columnPreferences.order
    .filter((key) => !columnPreferences.hidden.includes(key))
    .map((key) => byColumnKey.get(key))
    .filter((column): column is DataGridColumn<AbstractRow> => Boolean(column));
  const openSubmission = (row: AbstractRow) => {
    navigate(`${listPath}/${encodeURIComponent(row.id)}/edit`);
  };
  const emptySubmissions = (
    <EmptyState
      compact
      icon={Search}
      title={rows.length ? "No abstracts match this view" : "No abstracts yet"}
      message={
        rows.length
          ? "Clear the filters to see every abstract."
          : "Add an abstract or publish a call for papers."
      }
      action={
        rows.length ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setQuery("");
              setStatus("all");
            }}
          >
            Clear filters
          </Button>
        ) : (
          <Button variant="accent" size="sm" onClick={openAddAbstract}>
            Add abstract
          </Button>
        )
      }
    />
  );

  const addDetail = (
    <section className={cardSurfaceClasses("default", "mx-auto max-w-3xl space-y-5 p-6")} aria-label="New submission">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="abstract-source">Source form</Label>
          <Select
            value={draft.formId}
            onValueChange={(formId) =>
              setDraft((current) => ({ ...current, formId }))
            }
          >
            <SelectTrigger id="abstract-source">
              <SelectValue placeholder="Choose a submission form" />
            </SelectTrigger>
            <SelectContent>
              {forms.map((form) => (
                <SelectItem key={form.id} value={form.id}>
                  {form.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="abstract-title">Title</Label>
          <Input
            id="abstract-title"
            value={draft.title}
            onChange={(change) =>
              setDraft((current) => ({
                ...current,
                title: change.target.value,
              }))
            }
            placeholder="Session title"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="abstract-status">Status</Label>
          <Select
            value={draft.status}
            onValueChange={(status) =>
              setDraft((current) => ({
                ...current,
                status: status as SubmissionStatus,
              }))
            }
          >
            <SelectTrigger id="abstract-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                [
                  "draft",
                  "pending",
                  "accept_queue",
                  "accepted",
                  "maybe",
                  "decline_queue",
                  "declined",
                  "withdrawn",
                ] as SubmissionStatus[]
              ).map((option) => (
                <SelectItem key={option} value={option}>
                  {statusLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="abstract-description">Description</Label>
          <Textarea
            id="abstract-description"
            value={draft.description}
            onChange={(change) =>
              setDraft((current) => ({
                ...current,
                description: change.target.value,
              }))
            }
            placeholder="What is this session about?"
          />
        </div>
        {addError && (
          <p role="alert" className="text-sm text-destructive">
            {addError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => { setAddOpen(false); navigate(listPath); }}
            disabled={adding}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void createAbstract()}
            disabled={adding}
          >
            {adding ? "Adding…" : "Add submission"}
          </Button>
        </div>
      </div>
    </section>
  );
  const closeSelected = () => {
    if (abstractId) { navigate(listPath); return; }
    const next = new URLSearchParams(searchParams);
    next.delete("selected");
    setSearchParams(next);
    setDecisionPreview(undefined);
    setDecisionResults([]);
  };
  const selectedDetail = selectedRow ? (
    <section className={cardSurfaceClasses("default", "space-y-6 p-6")} aria-label={`Edit ${selectedRow.title}`}>
      <div className="mb-5">
        <DecisionButtons
          status={selectedRow.status}
          pending={updatingDecisionId === selectedRow.id}
          size="md"
          onDecide={(next) => void updateStatus(selectedRow.id, next)}
        />
      </div>
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="abstract-edit-title">Title</Label>
          <Input
            id="abstract-edit-title"
            value={editDraft.title}
            onChange={(change) =>
              setEditDraft((current) => ({
                ...current,
                title: change.target.value,
              }))
            }
            placeholder="Session title"
          />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <div className="flex items-center gap-2">
            {editableStatuses.includes(selectedRow.status) ? (
              <Select
                value={selectedRow.status}
                onValueChange={(value) =>
                  void updateStatus(selectedRow.id, value as SubmissionStatus)
                }
              >
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {editableStatuses.map((option) => (
                    <SelectItem key={option} value={option}>
                      {statusLabels[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-base font-medium">
                {statusLabels[selectedRow.status]}
              </span>
            )}
          </div>
        </div>
        <div>
          <Label className="text-sm text-muted-foreground">Speaker</Label>
          <p className="mt-1 text-base">{selectedRow.speaker}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="abstract-edit-description">Abstract</Label>
          <Textarea
            id="abstract-edit-description"
            value={editDraft.description}
            onChange={(change) =>
              setEditDraft((current) => ({
                ...current,
                description: change.target.value,
              }))
            }
            placeholder="What is this session about?"
            rows={5}
          />
        </div>
        <div>
          <Label className="text-sm text-muted-foreground">Track</Label>
          <p className="mt-1 text-base">{selectedRow.track}</p>
        </div>
        <div className="space-y-2">
          <Label>Tags</Label>
          <div>
            <TagsCell
              row={selectedRow}
              library={tagLibrary}
              saving={Boolean(taggingId)}
              onChange={(tagIds) => void updateTags(selectedRow.id, tagIds)}
            />
          </div>
        </div>
        {editError && (
          <p role="alert" className="text-sm text-destructive">
            {editError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!editDirty || savingEdit}
            onClick={() => {
              setEditDraft({
                title:
                  selectedRow.title === "Untitled submission"
                    ? ""
                    : selectedRow.title,
                description:
                  selectedRow.description === "—" ? "" : selectedRow.description,
              });
              setEditError(undefined);
            }}
          >
            Discard changes
          </Button>
          <Button
            type="button"
            onClick={() => void saveAbstractEdits()}
            disabled={!editDirty || savingEdit}
          >
            {savingEdit ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
      {decisionPreview && (
        <section
          className="mt-6 space-y-4 rounded-lg bg-background p-4"
          aria-labelledby="decision-preview-heading"
        >
          <div>
            <h3 id="decision-preview-heading" className="text-sm font-semibold">
              Review decision email
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {decisionPreview.templateName
                ? `Using “${decisionPreview.templateName}”.`
                : "Using the built-in branded template."}
            </p>
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium">{decisionPreview.subject}</p>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {decisionPreview.body}
            </p>
          </div>
          <div className="text-sm">
            <p className="font-medium">
              Recipients ({decisionPreview.recipients.length})
            </p>
            <ul className="mt-1 space-y-2 text-muted-foreground">
              {decisionPreview.recipients.map((recipient) => {
                const result = decisionResults.find(
                  (entry) => entry.speakerId === recipient.speakerId,
                );
                return (
                  <li key={recipient.speakerId}>
                    <span>
                      {recipient.name} · {recipient.email || "No email on file"}
                    </span>
                    {result && (
                      <span
                        className={
                          result.status === "sent"
                            ? "ml-2 text-success"
                            : "ml-2 text-destructive"
                        }
                      >
                        {result.status === "sent"
                          ? "Sent"
                          : (result.error ?? result.reason ?? "Skipped")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            {decisionPreview.calendarAttached
              ? `Calendar invite attached${decisionPreview.scheduleTime ? ` for ${decisionPreview.scheduleTime}` : ""}.`
              : "No calendar invite will be attached."}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDecisionPreview(undefined)}
              disabled={sendingId === selectedRow.id}
            >
              {decisionResults.length ? "Close" : "Cancel"}
            </Button>
            {decisionResults.some((result) => result.status === "failed") && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void sendDecision(
                    selectedRow,
                    decisionResults
                      .filter(
                        (result) =>
                          result.status === "failed" && result.speakerId,
                      )
                      .map((result) => result.speakerId!),
                  )
                }
                disabled={sendingId === selectedRow.id}
              >
                Retry failed
              </Button>
            )}
            <Button
              type="button"
              onClick={() => void sendDecision(selectedRow)}
              disabled={
                sendingId === selectedRow.id ||
                (decisionResults.length > 0 &&
                  decisionResults.every(
                    (result) => result.status === "sent",
                  )) ||
                !decisionPreview.recipients.some((recipient) =>
                  isValidEmail(recipient.email),
                )
              }
            >
              {sendingId === selectedRow.id
                ? "Sending…"
                : decisionResults.length
                  ? "Send again"
                  : `Send to ${decisionPreview.recipients.length}`}
            </Button>
          </div>
        </section>
      )}
    </section>
  ) : undefined;
  if (creating || addOpen) return <AppLayout title="New submission">{addDetail}</AppLayout>;
  if (abstractId) return <AppLayout title={selectedRow?.title ?? "Submission"}>{loading ? <p className="text-sm text-muted-foreground">Loading submission…</p> : selectedDetail ?? <EmptyState title="Submission not found" message="This submission may have been removed." action={<Button variant="outline" onClick={closeSelected}>Back to submissions</Button>} />}</AppLayout>;
  return (
    <AppLayout title="Submissions">
      <div className="space-y-3">
        {loadError && (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        )}
        {decisionFeedback && (
          <p role="status" className="text-sm text-muted-foreground">
            {decisionFeedback}
          </p>
        )}
        <ContentToolbar
          ariaLabel="Submission controls"
          search={
            <div className="relative min-w-0">
              <Label className="sr-only" htmlFor="abstract-search">
                Search abstracts
              </Label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="abstract-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-8 pl-9"
                placeholder="Search submissions"
              />
            </div>
          }
          utilities={
            <>
              <FilterMenu
                ariaLabel="Submission statuses"
                value={status}
                onValueChange={(value) =>
                  setStatus(value as SubmissionStatus | "all")
                }
                tabs={tabs}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => downloadCsv(visibleRows)}
                disabled={loading}
                aria-label="Export submissions as CSV"
              >
                <Download className="h-4 w-4" />
              </Button>
              <SubmissionViewToggle
                value={viewMode}
                onChange={updateViewMode}
              />
              {viewMode === "table" && (
                <ColumnsControl
                  preferences={columnPreferences}
                  onChange={updateColumnPreferences}
                />
              )}
            </>
          }
          primaryAction={
            <Button variant="accent" size="sm" onClick={openAddAbstract}>
              Add submission
            </Button>
          }
        />
        {viewMode === "table" ? (
          <DataGrid
            rows={visibleRows}
            columns={columns}
            empty={emptySubmissions}
            loading={loading}
            paginated
          />
        ) : loading ? (
          <div
            className="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-3"
            aria-busy="true"
            aria-live="polite"
          >
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className={cardSurfaceClasses(
                  "default",
                  "h-32 animate-pulse bg-muted/60",
                )}
              />
            ))}
            <span className="sr-only">Loading submissions…</span>
          </div>
        ) : !visibleRows.length ? (
          emptySubmissions
        ) : viewMode === "kanban" ? (
          <div
            className="flex min-w-0 gap-3 overflow-x-auto pb-2"
            aria-label="Submissions kanban board"
          >
            {(status === "all" ? submissionStatusOrder : [status]).map(
              (columnStatus) => {
                const statusRows = visibleRows.filter(
                  (row) => row.status === columnStatus,
                );
                return (
                  <section
                    key={columnStatus}
                    className={cardSurfaceClasses(
                      "muted",
                      "w-72 shrink-0 self-start p-3",
                    )}
                    aria-labelledby={`submission-column-${columnStatus}`}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3 px-1">
                      <h2
                        id={`submission-column-${columnStatus}`}
                        className="text-sm font-semibold"
                      >
                        {statusLabels[columnStatus]}
                      </h2>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {statusRows.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {statusRows.map((row) => (
                        <SubmissionCard
                          key={row.id}
                          row={row}
                          onOpen={openSubmission}
                          compact
                        />
                      ))}
                      {!statusRows.length && (
                        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                          No submissions
                        </p>
                      )}
                    </div>
                  </section>
                );
              },
            )}
          </div>
        ) : (
          <div
            className="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-3"
            aria-label="Submissions grid"
          >
            {visibleRows.map((row) => (
              <SubmissionCard key={row.id} row={row} onOpen={openSubmission} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
