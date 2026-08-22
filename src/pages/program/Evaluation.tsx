import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { Bot, ListChecks } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { BlindedBadge } from "@/components/shared/BlindedBadge";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cardSurfaceClasses } from "@/components/ui/card";
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
  AiAssessment,
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
  evaluationPlanId: string;
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
  const [searchParams] = useSearchParams();
  const requestedAssignmentId = searchParams.get("assignment") ?? undefined;
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
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [planWorkspaceTab, setPlanWorkspaceTab] = useState<
    "progress" | "criteria" | "assignments"
  >("progress");
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
  const [assessment, setAssessment] = useState<AiAssessment | null>();
  const [assessmentBusy, setAssessmentBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      // Resolve a reviewer's queue before touching organizer-only event tables. Besides avoiding
      // a burst of expected authorization failures, this is independent of how a particular
      // Convex client version serializes errors across realms.
      const reviewerRows = await repo.evaluations.myQueue();
      if (reviewerRows.length > 0) {
        setReviewerOnly(true);
        setSurface("queue");
        setMyQueue(reviewerRows);
        setEventId(undefined);
        setPlans([]);
        setAssignments([]);
        setSubmissions([]);
        setSpeakers([]);
        setReviews([]);
        setTags([]);
        setTracks([]);
        setSelectedPlanId(undefined);
        return;
      }
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
  // The dropdown is available from both the organizer workspace and the reviewer queue.
  // Always select a concrete plan-workspace panel so its entries do more than merely close
  // the menu when the organizer is already on the plans surface.
  const openPlanWorkspace = (
    tab: "progress" | "criteria" | "assignments",
  ) => {
    setSurface("plans");
    setPlanWorkspaceTab(tab);
  };
  const openCreatePlan = () => {
    setSurface("plans");
    setShowCreatePlan(true);
    requestAnimationFrame(() =>
      document.getElementById("new-evaluation-plan")?.focus(),
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
            evaluationPlanId: row.evaluationPlanId,
            round: row.round,
            scoringScaleMax: row.scoringScaleMax,
            planName: row.planName,
            criteria: row.criteria ?? [],
            review: row.review,
            title: row.submissionTitle,
            anonymized: row.anonymized === true,
            // A blinded row and a row whose submission has no speaker must read identically, or the
            // absence itself becomes a signal.
            speaker: row.anonymized ? HIDDEN_SPEAKER : row.speakerNames?.join(", ") || "",
            track: row.submissionAnswers.track || "",
            abstract: row.submissionAnswers.abstract || "",
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
                evaluationPlanId: assignment.evaluationPlanId,
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
                      .join(", ") || "",
                track: String(answers?.track || ""),
                abstract: String(answers?.abstract || ""),
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
  const open = queueRows.filter((row) => !isScored(row));

  useEffect(() => {
    if (!requestedAssignmentId) return;
    const queueRow = queueRows.find((row) => row.id === requestedAssignmentId);
    if (queueRow) {
      setSurface("queue");
      setActiveAssignmentId(queueRow.id);
      return;
    }
    const assignment = assignments.find((row) => row.id === requestedAssignmentId);
    if (!assignment) return;
    setSurface("plans");
    setSelectedPlanId(assignment.evaluationPlanId);
    setPlanWorkspaceTab("assignments");
    setSelectedSubmissionIds([assignment.submissionId]);
  }, [assignments, queueRows, requestedAssignmentId]);

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

  useEffect(() => {
    if (!active) { setAssessment(undefined); return; }
    if (typeof repo.evaluations.getAssessment !== "function") { setAssessment(null); return; }
    let current = true;
    void repo.evaluations.getAssessment({ eventId: active.eventId as EventId, submissionId: active.submissionId as never, evaluationPlanId: active.evaluationPlanId }).then((value) => { if (current) setAssessment(value); }).catch(() => { if (current) setAssessment(null); });
    return () => { current = false; };
  }, [active, repo]);

  const requestAssessment = async () => {
    if (!active || typeof repo.evaluations.requestAssessment !== "function" || typeof repo.evaluations.getAssessment !== "function") return;
    setAssessmentBusy(true); setError(undefined);
    try {
      await repo.evaluations.requestAssessment({ eventId: active.eventId as EventId, submissionId: active.submissionId as never, evaluationPlanId: active.evaluationPlanId });
      setAssessment(await repo.evaluations.getAssessment({ eventId: active.eventId as EventId, submissionId: active.submissionId as never, evaluationPlanId: active.evaluationPlanId }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "AI assessment could not be requested."); }
    finally { setAssessmentBusy(false); }
  };

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
      setShowCreatePlan(false);
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

  const setAiAssistEnabled = async (enabled: boolean) => {
    if (!eventId || !selectedPlan) return;
    setSaving(true);
    setError(undefined);
    try {
      await repo.evaluations.savePlan({
        id: selectedPlan.id,
        eventId: eventId as never,
        name: selectedPlan.name,
        rounds: selectedPlan.rounds,
        scoringScaleMax: selectedPlan.scoringScaleMax,
        aiAssistEnabled: enabled,
        anonymized: selectedPlan.anonymized,
        criteria: selectedPlan.criteria,
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update AI assistance.");
    } finally {
      setSaving(false);
    }
  };

  const queueColumns: DataGridColumn<QueueRow>[] = [
    {
      key: "title",
      header: "Submission",
      cell: (row) => (
        <button
          type="button"
          onClick={() => setActiveAssignmentId(row.id)}
          className="py-1 text-left"
        >
          <span className="block text-base font-medium underline-offset-4 hover:underline">
            {row.title}
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
          ? "—"
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
          <span className="text-muted-foreground">Ready</span>
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
  return (
    <AppLayout title="Judge submissions">
      <div className="space-y-4">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <ContentToolbar
          ariaLabel="Evaluation controls"
          utilities={
            !reviewerOnly ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Manage evaluations
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => openPlanWorkspace("criteria")}
                  >
                    Evaluation plans
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSurface("queue")}>
                    My reviewer queue
                  </DropdownMenuItem>
                  {surface === "plans" && selectedPlan && (
                    <>
                      {plans.length > 1 && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Evaluation plan</DropdownMenuLabel>
                          {plans.map((plan) => (
                            <DropdownMenuItem
                              key={plan.id}
                              onSelect={() => selectPlan(plan.id)}
                            >
                              {plan.name}
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => openPlanWorkspace("progress")}
                      >
                        Review progress
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => openPlanWorkspace("criteria")}
                      >
                        Scoring criteria
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => openPlanWorkspace("assignments")}
                      >
                        Assign reviewers
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    onSelect={openCreatePlan}
                  >
                    Create evaluation plan
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : undefined
          }
        />
        {!reviewerOnly && surface === "plans" ? (
          <>
            {showCreatePlan && (
              <section className={cardSurfaceClasses("default", "p-4")}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">Create evaluation plan</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreatePlan(false)}
                  >
                    Cancel
                  </Button>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_9rem_9rem_auto]">
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
                    variant="accent"
                    onClick={() => void createPlan()}
                    disabled={saving || !newPlanName.trim()}
                  >
                    Create plan
                  </Button>
                </div>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={newPlanAnonymized}
                    onCheckedChange={(value) =>
                      setNewPlanAnonymized(value === true)
                    }
                  />
                  <span>
                    <span className="font-medium">Blind review</span>
                  </span>
                </label>
              </section>
            )}
            {!loading && plans.length === 0 && (
              <section className={cardSurfaceClasses("default", "p-2")}>
                <EmptyState
                  compact
                  title="No evaluation plans yet"
                  message="Create a plan to begin assigning submissions to reviewers."
                  action={
                    <Button
                      variant="accent"
                      onClick={() => setShowCreatePlan(true)}
                    >
                      Create evaluation plan
                    </Button>
                  }
                />
              </section>
            )}
            {selectedPlan && (
              <>
                {planWorkspaceTab === "progress" && eventId && (
                  <ReviewerProgressPanel
                    eventId={eventId as EventId}
                    plan={selectedPlan}
                    refreshKey={progressRefreshKey}
                  />
                )}

                {planWorkspaceTab === "criteria" && (
                  <section className={cardSurfaceClasses("default", "p-6")}>
                    <label className="mb-6 flex items-start gap-3 text-sm">
                      <Checkbox
                        checked={selectedPlan.aiAssistEnabled}
                        onCheckedChange={(value) => void setAiAssistEnabled(value === true)}
                        disabled={saving}
                      />
                      <span className="space-y-1">
                        <span className="block font-medium">AI first-pass assistance</span>
                        <span className="block text-muted-foreground">
                          Give organizers and assigned reviewers a non-binding score and concise rationale. Human reviews and decisions remain authoritative.
                        </span>
                      </span>
                    </label>
                    <CriteriaEditor
                      criteria={criteriaDraft}
                      scoringScaleMax={selectedPlan.scoringScaleMax}
                      onChange={(next) => {
                        setCriteriaDraft(next);
                        setCriteriaSaved(false);
                      }}
                      disabled={saving}
                    />
                    <div className="mt-3 flex items-center justify-end gap-3">
                      {criteriaSaved && (
                        <p className="text-sm text-muted-foreground">
                          Criteria saved.
                        </p>
                      )}
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={() => void saveCriteria()}
                        disabled={saving || criteriaDraftErrors.size > 0}
                      >
                        Save criteria
                      </Button>
                    </div>
                  </section>
                )}

                {planWorkspaceTab === "assignments" && (
                  <div className="space-y-3">
                  <section className={cardSurfaceClasses("default", "p-6")}>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <h2 className="font-semibold">Assign submissions</h2>
                      <div className="flex flex-wrap items-end gap-2">
                        <Select
                          value={String(assignmentRound)}
                          onValueChange={(value) =>
                            setAssignmentRound(Number(value))
                          }
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
                        getRowLabel={(submission) =>
                          submission.title || "submission"
                        }
                      />
                    </div>
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
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <section className={cardSurfaceClasses("default", "p-6")}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-lg font-semibold">My reviews</h2>
                {queueBlinded ? <BlindedBadge /> : null}
              </div>
              <DataGrid
                rows={queueRows}
                columns={queueColumns}
                empty="No reviews assigned."
                loading={loading}
              />
            </section>
            {active && (
              <section className={cardSurfaceClasses("default", "p-6")}>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{active.title}</h2>
                      {active.anonymized ? <BlindedBadge /> : null}
                    </div>
                  </div>
                  {active.abstract && <p className="mt-5 text-sm leading-6">{active.abstract}</p>}
                  <section className="mt-5 rounded-md bg-muted/50 p-4" aria-label="AI review assistance"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-2"><Bot className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" /><div><h3 className="text-sm font-medium">AI first-pass context</h3><p className="mt-1 text-xs text-muted-foreground">Non-binding guidance only. Your review and the final program decision remain authoritative.</p></div></div>{!reviewerOnly && <Button type="button" size="sm" variant="outline" disabled={assessmentBusy || assessment?.status === "queued"} onClick={() => void requestAssessment()}>{assessmentBusy || assessment?.status === "queued" ? "Assessing…" : assessment?.status === "failed" ? "Retry assessment" : assessment?.status === "completed" ? "Regenerate" : "Generate assessment"}</Button>}</div>{assessment?.status === "completed" && <div className="mt-4 space-y-2"><p className="text-sm font-medium">Suggested score: {assessment.score}</p><p className="text-sm leading-6">{assessment.rationale}</p>{assessment.criteria?.map((criterion) => <div key={criterion.criterionId} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{criterion.score === undefined ? "Criterion" : `${criterion.score} · Criterion`}</span> — {criterion.rationale}</div>)}<p className="text-xs text-muted-foreground">{assessment.model} · prompt {assessment.promptVersion}</p></div>}{assessment?.status === "failed" && <p role="alert" className="mt-3 text-sm text-destructive">{assessment.error || "The assessment failed. An organizer can retry it."}</p>}{assessment === null && reviewerOnly && <p className="mt-3 text-sm text-muted-foreground">No AI assessment has been generated for this submission.</p>}</section>
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
                                ? "h-10 w-10 rounded-full bg-primary text-primary-foreground text-sm font-medium"
                                : "h-10 w-10 rounded-full bg-muted text-sm font-medium hover:bg-muted/70"
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
                    Comments
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
          </>
        )}
      </div>
    </AppLayout>
  );
}
