import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { Check, ClipboardCheck, ListChecks, Plus, Users } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { BlindedBadge } from "@/components/shared/BlindedBadge";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { StatCard } from "@/components/shared/StatCard";
import { StatusTabs } from "@/components/shared/StatusTabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isForbiddenError } from "@/lib/authorization";
import {
  averageScore,
  criteriaErrors,
  firstMissingCriterion,
  weightedTotal,
} from "@/lib/evaluation-score";
import { useRepo } from "@/data/repo";
import { ReviewerProgressPanel } from "@/components/evaluation/ReviewerProgressPanel";
import { AssignByFilterCard } from "./AssignByFilterCard";
import { CriteriaEditor } from "./CriteriaEditor";
import { ScorecardForm } from "./ScorecardForm";
import type {
  AssignmentFilter,
  Evaluation,
  EvaluationAssignment,
  EvaluationCriterion,
  EvaluationCriterionScore,
  EvaluationPlan,
  EventId,
  ReviewerQueueRow,
  Submission,
  Tag,
  Track,
} from "@/data/types";

// The one shape the queue renders, whichever load path produced it: the organizer view stitches
// it from the full event tables, the reviewer view gets it pre-joined from evaluations:myQueue.
type QueueRow = {
  id: string;
  eventId: string;
  submissionId: string;
  round: number;
  scoringScaleMax: number;
  planName: string;
  // The plan's scorecard criteria (issue #56). Empty means this plan uses the single score box.
  criteria: EvaluationCriterion[];
  review?: {
    id?: string;
    score?: number;
    comments?: string;
    criteriaScores?: EvaluationCriterionScore[];
  };
  title: string;
  // On a blinded plan this is already "Speaker hidden" — the reviewer path never received a name
  // to begin with (convex/evaluations.ts omits it), so there is nothing here to un-hide.
  speaker: string;
  anonymized: boolean;
  track: string;
  abstract: string;
};

const HIDDEN_SPEAKER = "Speaker hidden";

// "Has this reviewer finished this row?" — a scorecard row is done when its criteria are
// answered, a single-score row when a score exists. Kept in one place so the queue counts, the
// status column, and the auto-advance after save all agree.
function rowTotal(row: QueueRow): number | undefined {
  if (!row.criteria.length) return row.review?.score;
  return weightedTotal(
    row.criteria,
    row.review?.criteriaScores,
    row.scoringScaleMax,
  );
}
function isScored(row: QueueRow): boolean {
  return rowTotal(row) !== undefined;
}
// The same question asked of a raw review row, for the organizer's progress counts: a scorecard
// review records no `score` at all, so counting only `score` would report it as never reviewed.
function isRecorded(review: Evaluation | undefined): boolean {
  return (
    review !== undefined &&
    (review.score !== undefined || Boolean(review.criteriaScores?.length))
  );
}

export default function Evaluation() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  // Reviewer identity is the signed-in Clerk account's email — the same identifier the
  // organizer types when assigning reviewers, and the same one convex/evaluations.ts checks
  // assignment ownership against. There is no picker: you can only ever review as yourself.
  const { user } = useUser();
  const myEmail = useMemo(
    () => user?.primaryEmailAddress?.emailAddress?.toLowerCase(),
    [user],
  );
  const [surface, setSurface] = useState<"plans" | "queue">("plans");
  const [eventId, setEventId] = useState<string>();
  const [plans, setPlans] = useState<EvaluationPlan[]>([]);
  const [assignments, setAssignments] = useState<EvaluationAssignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [speakers, setSpeakers] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [tags, setTags] = useState<Tag[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [reviews, setReviews] = useState<Evaluation[]>([]);
  // Set when the organizer-scoped load is refused: this account is a reviewer, not an organizer,
  // and the page renders its own queue only — no plans, no assignment management.
  const [reviewerOnly, setReviewerOnly] = useState(false);
  const [myQueue, setMyQueue] = useState<ReviewerQueueRow[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>();
  const [reviewerEmailsInput, setReviewerEmailsInput] = useState("");
  const [assignmentRound, setAssignmentRound] = useState(1);
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>(
    [],
  );
  const [activeAssignmentId, setActiveAssignmentId] = useState<string>();
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanRounds, setNewPlanRounds] = useState<1 | 2>(1);
  const [newPlanScale, setNewPlanScale] = useState<5 | 10>(5);
  const [newPlanAnonymized, setNewPlanAnonymized] = useState(false);
  const [scoreDraft, setScoreDraft] = useState<number>();
  const [commentsDraft, setCommentsDraft] = useState("");
  // Bumped after a write that can change reviewer completion, so the progress panel refetches
  // without a route change (issue #59, FR-006).
  const [progressRefreshKey, setProgressRefreshKey] = useState(0);
  // Scorecard drafts (issue #56): the reviewer's per-criterion values for the active row, and
  // the organizer's in-progress criteria for the selected plan.
  const [criteriaScoresDraft, setCriteriaScoresDraft] = useState<
    EvaluationCriterionScore[]
  >([]);
  const [criteriaDraft, setCriteriaDraft] = useState<EvaluationCriterion[]>([]);
  const [criteriaSaved, setCriteriaSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const event = activeEvent ?? (await repo.events.list()).at(0);
      if (!event) {
        setEventId(undefined);
        setPlans([]);
        setAssignments([]);
        setTags([]);
        setTracks([]);
        return;
      }
      const scope = { eventId: event.id };
      const [
        nextPlans,
        nextAssignments,
        nextSubmissions,
        nextSpeakers,
        nextReviews,
        nextTags,
        nextTracks,
      ] = await Promise.all([
        repo.evaluations.listPlans(scope),
        repo.evaluations.listAssignments(scope),
        repo.submissions.list(scope),
        repo.speakers.list(scope),
        repo.evaluations.list(scope),
        repo.tags.list(scope),
        repo.events.listTracks(scope),
      ]);
      setReviewerOnly(false);
      setMyQueue([]);
      setEventId(event.id);
      setPlans(nextPlans);
      setAssignments(nextAssignments);
      setSubmissions(nextSubmissions);
      setSpeakers(nextSpeakers);
      setReviews(nextReviews);
      setTags(nextTags);
      setTracks(nextTracks);
      setSelectedPlanId((current) =>
        nextPlans.some((plan) => plan.id === current)
          ? current
          : nextPlans[0]?.id,
      );
    } catch (cause) {
      // A reviewer who is not an organizer is refused by every organizer-gated list above. That
      // is expected, not a page failure: fall back to the one reviewer-scoped query, which needs
      // no event id because it resolves the event from the caller's own assignments.
      if (!isForbiddenError(cause)) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load evaluations.",
        );
        return;
      }
      try {
        const rows = await repo.evaluations.myQueue();
        setReviewerOnly(true);
        setSurface("queue");
        setMyQueue(rows);
        setEventId(undefined);
        setPlans([]);
        setAssignments([]);
        setSubmissions([]);
        setSpeakers([]);
        setReviews([]);
        setTags([]);
        setTracks([]);
        setSelectedPlanId(undefined);
      } catch (queueCause) {
        setError(
          queueCause instanceof Error
            ? queueCause.message
            : "Could not load your reviewer queue.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [activeEvent, repo]);
  useEffect(() => {
    void load();
  }, [load]);

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
  // The criteria editor is a draft of the selected plan's own criteria; switching plans or
  // reloading after a save re-seeds it from what is actually persisted.
  useEffect(() => {
    setCriteriaDraft(
      plans.find((plan) => plan.id === selectedPlanId)?.criteria ?? [],
    );
    setCriteriaSaved(false);
  }, [plans, selectedPlanId]);
  const selectPlan = (planId: string) => {
    const plan = plans.find((candidate) => candidate.id === planId);
    setSelectedPlanId(planId);
    setAssignmentRound((current) =>
      Math.min(Math.max(1, current), plan?.rounds ?? 1),
    );
  };
  const reviewByAssignment = useMemo(
    () =>
      new Map(
        reviews
          .filter((review) => review.assignmentId)
          .map((review) => [review.assignmentId!, review]),
      ),
    [reviews],
  );
  const submissionById = useMemo(
    () => new Map(submissions.map((submission) => [submission.id, submission])),
    [submissions],
  );
  const speakerNameById = useMemo(
    () => new Map(speakers.map((speaker) => [speaker.id, speaker.name])),
    [speakers],
  );
  const planById = useMemo(
    () => new Map(plans.map((plan) => [plan.id, plan])),
    [plans],
  );
  const queueRows = useMemo<QueueRow[]>(
    () =>
      reviewerOnly
        ? myQueue.map((row) => ({
            id: row.assignmentId,
            eventId: row.eventId,
            submissionId: row.submissionId,
            round: row.round,
            scoringScaleMax: row.scoringScaleMax,
            planName: row.planName,
            criteria: row.criteria ?? [],
            review: row.review,
            title: row.submissionTitle,
            anonymized: row.anonymized === true,
            // A blinded row and a row whose submission has no speaker must read identically, or the
            // absence itself becomes a signal.
            speaker: row.anonymized
              ? HIDDEN_SPEAKER
              : row.speakerNames?.join(", ") || "Unassigned",
            track: row.submissionAnswers.track || "Unassigned",
            abstract: row.submissionAnswers.abstract || "No abstract provided.",
          }))
        : assignments
            .filter(
              (assignment) =>
                !!myEmail && assignment.reviewerUserId === myEmail,
            )
            .map((assignment) => {
              const submission = submissionById.get(assignment.submissionId);
              const answers = submission?.answers as
                Record<string, unknown> | undefined;
              const review = reviewByAssignment.get(assignment.id);
              // An organizer reviewing their own queue sees the blinded surface too, so this tab always
              // shows what a reviewer would see. Their organizer-facing tables — the assignment table
              // below, the Abstracts grid, submission detail — are untouched by the flag.
              const anonymized =
                planById.get(assignment.evaluationPlanId)?.anonymized === true;
              return {
                id: assignment.id,
                eventId: assignment.eventId,
                submissionId: assignment.submissionId,
                round: assignment.round,
                scoringScaleMax:
                  planById.get(assignment.evaluationPlanId)?.scoringScaleMax ??
                  5,
                planName:
                  planById.get(assignment.evaluationPlanId)?.name ??
                  "Evaluation plan",
                criteria:
                  planById.get(assignment.evaluationPlanId)?.criteria ?? [],
                review: review
                  ? {
                      id: review.id,
                      score: review.score,
                      comments: review.comments,
                      criteriaScores: review.criteriaScores,
                    }
                  : undefined,
                title:
                  submission?.title ||
                  String(answers?.title || "Untitled submission"),
                anonymized,
                speaker: anonymized
                  ? HIDDEN_SPEAKER
                  : submission?.speakerIds
                      .map((id) => speakerNameById.get(id) || "Unknown speaker")
                      .join(", ") || "Unassigned",
                track: String(answers?.track || "Unassigned"),
                abstract: String(answers?.abstract || "No abstract provided."),
              };
            }),
    [
      assignments,
      myEmail,
      myQueue,
      planById,
      reviewByAssignment,
      reviewerOnly,
      speakerNameById,
      submissionById,
    ],
  );
  const active =
    queueRows.find((row) => row.id === activeAssignmentId) ??
    queueRows.find((row) => !isScored(row)) ??
    queueRows[0];
  const queueBlinded = queueRows.some((row) => row.anonymized);
  const completed = queueRows.filter(isScored);
  const open = queueRows.filter((row) => !isScored(row));

  useEffect(() => {
    if (!active) {
      setActiveAssignmentId(undefined);
      setScoreDraft(undefined);
      setCommentsDraft("");
      setCriteriaScoresDraft([]);
      return;
    }
    setActiveAssignmentId(active.id);
    setScoreDraft(active.review?.score);
    setCommentsDraft(active.review?.comments ?? "");
    setCriteriaScoresDraft(active.review?.criteriaScores ?? []);
  }, [active]);

  const createPlan = async () => {
    if (!eventId || !newPlanName.trim()) return;
    setSaving(true);
    setError(undefined);
    try {
      const id = await repo.evaluations.savePlan({
        eventId: eventId as never,
        name: newPlanName,
        rounds: newPlanRounds,
        scoringScaleMax: newPlanScale,
        aiAssistEnabled: false,
        anonymized: newPlanAnonymized,
      });
      setNewPlanName("");
      setNewPlanAnonymized(false);
      await load();
      setSelectedPlanId(id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create this evaluation plan.",
      );
    } finally {
      setSaving(false);
    }
  };

  const reviewerEmails = useMemo(
    () =>
      reviewerEmailsInput
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    [reviewerEmailsInput],
  );

  const assignSelected = async () => {
    if (
      !eventId ||
      !selectedPlan ||
      !selectedSubmissionIds.length ||
      !reviewerEmails.length
    )
      return;
    setSaving(true);
    setError(undefined);
    try {
      await repo.evaluations.assign({
        eventId: eventId as never,
        evaluationPlanId: selectedPlan.id,
        submissionIds: selectedSubmissionIds,
        reviewerUserIds: reviewerEmails,
        round: assignmentRound,
      });
      setSelectedSubmissionIds([]);
      setReviewerEmailsInput("");
      await load();
      setProgressRefreshKey((key) => key + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create assignments.",
      );
    } finally {
      setSaving(false);
    }
  };

  // Bulk path. The card owns its own confirmation and result line; the page's job is the write
  // and the refetch that makes the assignment table, plan progress and stat cards agree.
  const assignByFilter = async (input: {
    evaluationPlanId: string;
    filter: AssignmentFilter;
    reviewerUserIds: string[];
    round: number;
  }) => {
    if (!eventId) throw new Error("No event is loaded.");
    setError(undefined);
    const outcome = await repo.evaluations.assignByFilter({
      eventId: eventId as never,
      ...input,
    });
    await load();
    return outcome;
  };

  // Unchanged for both surfaces: evaluations:save authorizes on the caller's own identity via the
  // assignment, so it works for a reviewer who holds no organizers row. The event id comes off
  // the row itself, which the reviewer path has even without events.list.
  // A plan with criteria sends criteriaScores and no score; a plan without criteria sends the
  // single score exactly as it always has. The server refuses the wrong shape either way.
  const usesScorecard = Boolean(active?.criteria.length);
  const missingCriterion = usesScorecard
    ? firstMissingCriterion(active?.criteria, criteriaScoresDraft)
    : undefined;
  const saveScore = async () => {
    if (!active || !myEmail) return;
    if (usesScorecard ? missingCriterion : !scoreDraft) return;
    setSaving(true);
    setError(undefined);
    try {
      await repo.evaluations.save({
        id: active.review?.id,
        assignmentId: active.id,
        eventId: active.eventId as never,
        submissionId: active.submissionId,
        reviewerName: myEmail,
        comments: commentsDraft,
        ...(usesScorecard
          ? { criteriaScores: criteriaScoresDraft }
          : { score: scoreDraft }),
      });
      await load();
      setProgressRefreshKey((key) => key + 1);
      const next = queueRows.find(
        (row) => row.id !== active.id && !isScored(row),
      );
      if (next) setActiveAssignmentId(next.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save this review.",
      );
    } finally {
      setSaving(false);
    }
  };

  // Criteria live on the plan, so saving them is a savePlan call carrying the plan's own
  // unchanged name/rounds/scale. Nothing persists until this runs, which is why the editor
  // needs no per-row confirmation.
  const criteriaDraftErrors = criteriaErrors(criteriaDraft);
  const saveCriteria = async () => {
    if (!eventId || !selectedPlan || criteriaDraftErrors.size) return;
    setSaving(true);
    setError(undefined);
    setCriteriaSaved(false);
    try {
      await repo.evaluations.savePlan({
        id: selectedPlan.id,
        eventId: eventId as never,
        name: selectedPlan.name,
        rounds: selectedPlan.rounds,
        scoringScaleMax: selectedPlan.scoringScaleMax,
        aiAssistEnabled: selectedPlan.aiAssistEnabled,
        criteria: criteriaDraft.map((criterion) => ({
          ...criterion,
          label: criterion.label.trim(),
        })),
      });
      await load();
      setCriteriaSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save these criteria.",
      );
    } finally {
      setSaving(false);
    }
  };

  const planRows = plans.map((plan) => {
    const planAssignments = assignments.filter(
      (assignment) => assignment.evaluationPlanId === plan.id,
    );
    const evaluated = planAssignments.filter((assignment) =>
      isRecorded(reviewByAssignment.get(assignment.id)),
    ).length;
    return {
      ...plan,
      assigned: planAssignments.length,
      evaluated,
      inProgress: planAssignments.length - evaluated,
    };
  });
  const planColumns: DataGridColumn<(typeof planRows)[number]>[] = [
    {
      key: "name",
      header: "Evaluation plan",
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => selectPlan(row.id)}
            className="font-medium text-left underline-offset-4 hover:underline"
          >
            {row.name}
          </button>
          {row.anonymized ? <BlindedBadge /> : null}
        </span>
      ),
    },
    { key: "rounds", header: "Rounds", cell: (row) => row.rounds },
    {
      key: "scale",
      header: "Scale",
      cell: (row) => `1–${row.scoringScaleMax}`,
    },
    {
      key: "criteria",
      header: "Criteria",
      cell: (row) =>
        row.criteria?.length
          ? `${row.criteria.length} weighted`
          : "Single score",
    },
    {
      key: "progress",
      header: "Progress",
      cell: (row) =>
        `${row.evaluated} evaluated · ${row.inProgress} in progress`,
    },
    { key: "assigned", header: "Assigned", cell: (row) => row.assigned },
  ];
  const queueColumns: DataGridColumn<QueueRow>[] = [
    {
      key: "title",
      header: "Submission",
      cell: (row) => (
        <button
          type="button"
          onClick={() => setActiveAssignmentId(row.id)}
          className="text-left"
        >
          <span className="block font-medium underline-offset-4 hover:underline">
            {row.title}
          </span>
          <span className="block text-xs text-muted-foreground">
            Round {row.round} · {row.speaker} · {row.track}
          </span>
        </button>
      ),
    },
    {
      key: "score",
      header: "Your score",
      cell: (row) => {
        const total = rowTotal(row);
        return total === undefined
          ? "Not scored"
          : `${row.criteria.length ? total.toFixed(2) : total}/${row.scoringScaleMax}`;
      },
    },
    {
      key: "state",
      header: "Status",
      cell: (row) =>
        isScored(row) ? (
          <span className="text-[hsl(var(--success))]">Complete</span>
        ) : (
          <span className="text-muted-foreground">Ready to review</span>
        ),
    },
  ];
  const assignmentColumns: DataGridColumn<Submission>[] = [
    {
      key: "submission",
      header: "Submission",
      cell: (submission) => (
        <span className="font-medium">
          {submission.title ||
            String(
              (submission.answers as Record<string, unknown> | undefined)
                ?.title || "Untitled submission",
            )}
        </span>
      ),
    },
    {
      key: "speaker",
      header: "Speaker",
      cell: (submission) =>
        submission.speakerIds
          .map((id) => speakerNameById.get(id) || "Unknown speaker")
          .join(", ") || "Unassigned",
    },
    {
      key: "status",
      header: "Status",
      cell: (submission) => (
        <span className="capitalize">
          {submission.status.replaceAll("_", " ")}
        </span>
      ),
    },
  ];
  const planAssigned = selectedPlan
    ? assignments.filter(
        (assignment) => assignment.evaluationPlanId === selectedPlan.id,
      ).length
    : 0;

  return (
    <AppLayout title="Evaluation">
      <div className="space-y-4">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {reviewerOnly && (
          <p className="text-sm text-muted-foreground">
            You're viewing your reviewer queue. Ask an organizer for full access
            to manage plans and assignments.
          </p>
        )}
        <StatusTabs
          ariaLabel="Evaluation views"
          value={reviewerOnly ? "queue" : surface}
          onValueChange={(value) => setSurface(value as "plans" | "queue")}
          tabs={
            reviewerOnly
              ? [
                  {
                    value: "queue",
                    label: "My reviewer queue",
                    count: open.length,
                  },
                ]
              : [
                  {
                    value: "plans",
                    label: "Evaluation plans",
                    count: plans.length,
                  },
                  {
                    value: "queue",
                    label: "My reviewer queue",
                    count: open.length,
                  },
                ]
          }
        />
        <ContentToolbar
          ariaLabel="Evaluation controls"
          primaryAction={
            reviewerOnly ? undefined : (
              <Button
                variant="accent"
                size="sm"
                onClick={() =>
                  document.getElementById("new-evaluation-plan")?.focus()
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                New Plan
              </Button>
            )
          }
        />
        {!reviewerOnly && surface === "plans" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Evaluation plans"
                value={plans.length}
                icon={ListChecks}
              />
              <StatCard
                label="Assigned reviews"
                value={assignments.length}
                icon={Users}
              />
              <StatCard
                label="Evaluated submissions"
                value={
                  reviews.filter(
                    (review) => review.assignmentId && isRecorded(review),
                  ).length
                }
                icon={ClipboardCheck}
              />
              <StatCard
                label="Review progress"
                value={
                  assignments.length
                    ? `${Math.round((reviews.filter((review) => review.assignmentId && isRecorded(review)).length / assignments.length) * 100)}%`
                    : "—"
                }
                icon={Check}
              />
            </div>
            <DataGrid
              rows={planRows}
              columns={planColumns}
              empty="No evaluation plans yet."
              loading={loading}
            />
            {/* Reviewer progress + reminders (issue #59). Self-contained: it owns its own query and
          send, and only needs to know which plan is selected and when to refetch. */}
            {eventId && selectedPlan && (
              <ReviewerProgressPanel
                eventId={eventId as EventId}
                plan={selectedPlan}
                refreshKey={progressRefreshKey}
              />
            )}
            <section className="rounded-lg bg-card p-5">
              <h2 className="font-semibold">Create evaluation plan</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                AI assistance is deliberately a stub; reviewers score
                submissions themselves.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_9rem_auto]">
                <Input
                  id="new-evaluation-plan"
                  value={newPlanName}
                  onChange={(event) => setNewPlanName(event.target.value)}
                  placeholder="Program committee review"
                  aria-label="Evaluation plan name"
                />
                <Select
                  value={String(newPlanRounds)}
                  onValueChange={(value) =>
                    setNewPlanRounds(Number(value) as 1 | 2)
                  }
                >
                  <SelectTrigger aria-label="Evaluation rounds">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 round</SelectItem>
                    <SelectItem value="2">2 rounds</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={String(newPlanScale)}
                  onValueChange={(value) =>
                    setNewPlanScale(Number(value) as 5 | 10)
                  }
                >
                  <SelectTrigger aria-label="Scoring scale">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">1–5 scale</SelectItem>
                    <SelectItem value="10">1–10 scale</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => void createPlan()}
                  disabled={saving || !newPlanName.trim()}
                >
                  Create plan
                </Button>
              </div>
              {/* Blind review (#57) — additive block, independent of the fields above. */}
              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="new-plan-anonymized"
                    checked={newPlanAnonymized}
                    onCheckedChange={(value) =>
                      setNewPlanAnonymized(value === true)
                    }
                  />
                  <Label
                    htmlFor="new-plan-anonymized"
                    className="text-sm font-medium"
                  >
                    Anonymize this plan
                  </Label>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reviewers will not see speaker names, headshots or contact
                  details for any round of this plan. Organizer views are
                  unaffected.
                </p>
              </div>
            </section>
            <section className="rounded-lg bg-card p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Scoring criteria</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Criteria belong to an evaluation plan and apply to every one
                    of its rounds. A plan with no criteria keeps the single
                    overall score.
                  </p>
                </div>
                <Select value={selectedPlanId ?? ""} onValueChange={selectPlan}>
                  <SelectTrigger
                    className="w-52"
                    aria-label="Plan to configure criteria for"
                  >
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedPlan ? (
                <div className="mt-4 space-y-4">
                  <CriteriaEditor
                    criteria={criteriaDraft}
                    scoringScaleMax={selectedPlan.scoringScaleMax}
                    onChange={(next) => {
                      setCriteriaDraft(next);
                      setCriteriaSaved(false);
                    }}
                    disabled={saving}
                  />
                  <div className="flex items-center justify-end gap-3">
                    {criteriaSaved && (
                      <p className="text-sm text-muted-foreground">
                        Criteria saved.
                      </p>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => void saveCriteria()}
                      disabled={saving || criteriaDraftErrors.size > 0}
                    >
                      Save criteria
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Create an evaluation plan first, then define what reviewers
                  score.
                </p>
              )}
            </section>
            <section className="rounded-lg bg-card p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Assign submissions</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Select rows, a plan, a round, and the reviewers' email
                    addresses. Each reviewer sees this in their own queue once
                    signed in with that email. Assignments are idempotent per
                    plan, round, submission, and reviewer.
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Select
                    value={selectedPlanId ?? ""}
                    onValueChange={selectPlan}
                  >
                    <SelectTrigger
                      className="w-52"
                      aria-label="Evaluation plan"
                    >
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={String(assignmentRound)}
                    onValueChange={(value) => setAssignmentRound(Number(value))}
                    disabled={!selectedPlan}
                  >
                    <SelectTrigger
                      className="w-32"
                      aria-label="Evaluation assignment round"
                    >
                      <SelectValue placeholder="Round" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedPlan
                        ? Array.from(
                            { length: selectedPlan.rounds },
                            (_, index) => index + 1,
                          ).map((round) => (
                            <SelectItem key={round} value={String(round)}>
                              Round {round}
                            </SelectItem>
                          ))
                        : null}
                    </SelectContent>
                  </Select>
                  <div className="space-y-1">
                    <Label htmlFor="reviewer-emails" className="sr-only">
                      Reviewer emails
                    </Label>
                    <Input
                      id="reviewer-emails"
                      value={reviewerEmailsInput}
                      onChange={(event) =>
                        setReviewerEmailsInput(event.target.value)
                      }
                      className="w-64"
                      placeholder="reviewer@example.com, another@example.com"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => void assignSelected()}
                    disabled={
                      saving ||
                      !selectedPlan ||
                      !selectedSubmissionIds.length ||
                      !reviewerEmails.length
                    }
                  >
                    Assign {selectedSubmissionIds.length || ""}
                  </Button>
                </div>
              </div>
              <div className="mt-4">
                <DataGrid
                  rows={submissions}
                  columns={assignmentColumns}
                  empty="No submissions are available to assign."
                  loading={loading}
                  selectedIds={selectedSubmissionIds}
                  onSelectionChange={setSelectedSubmissionIds}
                  getRowLabel={(submission) => submission.title || "submission"}
                />
              </div>
              {selectedPlan && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {selectedPlan.name}: {planAssigned} assignment
                  {planAssigned === 1 ? "" : "s"} · assigning Round{" "}
                  {assignmentRound} of {selectedPlan.rounds}
                </p>
              )}
            </section>
            <AssignByFilterCard
              tags={tags}
              tracks={tracks}
              submissions={submissions}
              plans={plans}
              selectedPlanId={selectedPlanId}
              onSelectPlan={selectPlan}
              round={assignmentRound}
              onRoundChange={setAssignmentRound}
              disabled={loading || saving}
              onAssign={assignByFilter}
            />
          </>
        ) : (
          <>
            <section className="rounded-lg bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">Reviewer queue</p>
                {queueBlinded ? <BlindedBadge /> : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {myEmail ? (
                  <>
                    Showing assignments for{" "}
                    <span className="font-medium text-foreground">
                      {myEmail}
                    </span>{" "}
                    — an organizer assigns reviewers by this email.
                  </>
                ) : (
                  "Sign in to see your review assignments."
                )}
              </p>
              {queueBlinded && (
                <p className="mt-1 text-sm text-muted-foreground">
                  This plan is blinded. Speaker identity is withheld from
                  reviewers by the server.
                </p>
              )}
            </section>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="In this queue" value={open.length} />
              <StatCard label="Completed" value={completed.length} />
              <StatCard
                label="Your average"
                value={averageScore(completed.map(rowTotal))?.toFixed(1) ?? "—"}
              />
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
              <DataGrid
                rows={queueRows}
                columns={queueColumns}
                empty="No assignments for this reviewer."
                loading={loading}
              />
              {active && (
                <section className="rounded-lg bg-card p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Round {active.round} · {active.planName}
                      </p>
                      {active.anonymized ? <BlindedBadge /> : null}
                    </div>
                    <h2 className="mt-1 text-base font-semibold">
                      {active.title}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {active.anonymized
                        ? `${HIDDEN_SPEAKER} — blinded review`
                        : active.speaker}{" "}
                      · {active.track}
                    </p>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-muted-foreground">
                    {active.abstract}
                  </p>
                  {usesScorecard ? (
                    <ScorecardForm
                      criteria={active.criteria}
                      values={criteriaScoresDraft}
                      scoringScaleMax={active.scoringScaleMax}
                      onChange={setCriteriaScoresDraft}
                      legacyScore={active.review?.score}
                      error={
                        missingCriterion
                          ? `"${missingCriterion.label}" is required.`
                          : undefined
                      }
                      disabled={saving}
                    />
                  ) : (
                    <fieldset className="mt-6">
                      <legend className="text-sm font-medium">
                        Score (1–{active.scoringScaleMax})
                      </legend>
                      <div className="mt-2 flex gap-2">
                        {Array.from(
                          { length: active.scoringScaleMax },
                          (_, index) => index + 1,
                        ).map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setScoreDraft(value)}
                            className={
                              scoreDraft === value
                                ? "h-9 w-9 rounded-full bg-primary text-primary-foreground text-sm font-medium"
                                : "h-9 w-9 rounded-full bg-muted text-sm font-medium hover:bg-muted/70"
                            }
                            aria-pressed={scoreDraft === value}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <label
                    className="mt-5 block text-sm font-medium"
                    htmlFor="review-comments"
                  >
                    Comments{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </label>
                  <Textarea
                    id="review-comments"
                    value={commentsDraft}
                    onChange={(event) => setCommentsDraft(event.target.value)}
                    className="mt-2"
                    placeholder="Share rationale for the program committee."
                  />
                  <div className="mt-5 flex justify-end">
                    <Button
                      variant="outline"
                      disabled={
                        saving ||
                        (usesScorecard
                          ? Boolean(missingCriterion)
                          : !scoreDraft)
                      }
                      onClick={() => void saveScore()}
                    >
                      {saving
                        ? "Saving…"
                        : isScored(active)
                          ? "Update review"
                          : "Submit review"}
                    </Button>
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
