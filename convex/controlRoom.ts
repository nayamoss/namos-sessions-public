import { v } from "convex/values";
import { query, assertEventOrganizerAccess } from "./functions";
import { conflictRows } from "./agenda";

type ControlRoomKind =
  | "decisions"
  | "reviews"
  | "acceptance_emails"
  | "overdue_tasks"
  | "missing_assets"
  | "unscheduled"
  | "conflicts"
  | "recording_coverage"
  | "publication_blockers";

type ControlRoomItem = {
  id: string;
  kind: ControlRoomKind;
  title: string;
  detail: string;
  href: string;
  severity: "attention" | "blocking";
};

const titleOf = (submission: { _id: unknown; title?: string }) =>
  submission.title?.trim() || `Submission ${String(submission._id).slice(-6)}`;

export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await assertEventOrganizerAccess(ctx, eventId);
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found.");

    const [submissions, speakers, tasks, assignments, evaluations, agenda, comms, templates, forms, embeds, recordings] =
      await Promise.all([
        ctx.db.query("submissions").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("speakers").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("onboarding_tasks").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("evaluation_assignments").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("evaluations").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("agenda_items").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("comms_log").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("comms_templates").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("submission_forms").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("embeds").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("session_recordings").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
      ]);
    const documents = (await Promise.all(
      speakers.map((speaker) =>
        ctx.db.query("speaker_documents").withIndex("by_speaker", (q) => q.eq("speakerId", speaker._id)).collect(),
      ),
    )).flat();

    const base = `/events/${event.slug}`;
    const submissionById = new Map(submissions.map((submission) => [String(submission._id), submission]));
    const speakerById = new Map(speakers.map((speaker) => [String(speaker._id), speaker]));
    const scheduledSubmissionIds = new Set(agenda.flatMap((item) => item.submissionId ? [String(item.submissionId)] : []));
    const completedAssignmentIds = new Set(evaluations.flatMap((review) => review.assignmentId ? [String(review.assignmentId)] : []));
    const acceptanceTemplateIds = new Set(templates.filter((template) => template.kind === "acceptance" || template.kind === "consolidated_decision").map((template) => String(template._id)));
    const notifiedSubmissionIds = new Set(comms.filter((entry) => entry.status === "sent" && entry.submissionId && (
      (entry.templateId && acceptanceTemplateIds.has(String(entry.templateId)))
      || entry.channel === "calendar_invite"
      || /\baccepted\b/i.test(entry.subject)
    )).map((entry) => String(entry.submissionId)));
    const slideSpeakerIds = new Set(documents.filter((document) => document.kind === "slides").map((document) => String(document.speakerId)));
    const accepted = submissions.filter((submission) => submission.status === "accepted");
    const acceptedSpeakerIds = new Set(accepted.flatMap((submission) => submission.speakerId ? [String(submission.speakerId)] : []));
    const speakerName = (speaker: (typeof speakers)[number]) => `${speaker.firstName} ${speaker.lastName}`.trim();
    const now = Date.now();
    const activeRecordings = new Map(recordings.filter((recording) => recording.role === "active").map((recording) => [recording.agendaItemId, recording]));

    const decisions: ControlRoomItem[] = submissions
      .filter((submission) => ["pending", "accept_queue", "maybe", "decline_queue"].includes(submission.status))
      .map((submission) => ({ id: String(submission._id), kind: "decisions", title: titleOf(submission), detail: "A program decision is still required.", href: `${base}/program/abstracts?selected=${submission._id}`, severity: "attention" }));

    const reviews: ControlRoomItem[] = assignments
      .filter((assignment) => !completedAssignmentIds.has(String(assignment._id)))
      .map((assignment) => ({ id: String(assignment._id), kind: "reviews", title: titleOf(submissionById.get(String(assignment.submissionId)) ?? { _id: assignment.submissionId }), detail: `Review by ${assignment.reviewerUserId} is incomplete.`, href: `${base}/program/evaluation?assignment=${assignment._id}`, severity: "attention" }));

    const acceptanceEmails: ControlRoomItem[] = accepted
      .filter((submission) => !notifiedSubmissionIds.has(String(submission._id)))
      .map((submission) => ({ id: String(submission._id), kind: "acceptance_emails", title: titleOf(submission), detail: "Accepted, but the speaker has not received the acceptance message.", href: `${base}/program/abstracts?selected=${submission._id}`, severity: "attention" }));

    const overdueTasks: ControlRoomItem[] = tasks
      .filter((task) => task.status !== "completed" && task.dueDate !== undefined && task.dueDate < now)
      .map((task) => ({ id: String(task._id), kind: "overdue_tasks", title: task.title, detail: `Overdue${task.speakerId && speakerById.get(String(task.speakerId)) ? ` for ${speakerName(speakerById.get(String(task.speakerId))!)}` : ""}.`, href: `${base}/portals/tasks?selected=${task._id}`, severity: "attention" }));

    const missingAssets: ControlRoomItem[] = speakers
      .filter((speaker) => acceptedSpeakerIds.has(String(speaker._id)))
      .flatMap((speaker) => [
        ...(!speaker.headshotStorageKey ? [{ id: `headshot-${speaker._id}`, kind: "missing_assets" as const, title: `${speakerName(speaker)} · headshot`, detail: "Accepted speaker is missing a headshot.", href: `${base}/program/speakers?selected=${speaker._id}`, severity: "blocking" as const }] : []),
        ...(!slideSpeakerIds.has(String(speaker._id)) ? [{ id: `slides-${speaker._id}`, kind: "missing_assets" as const, title: `${speakerName(speaker)} · slides`, detail: "Accepted speaker has not uploaded slides.", href: `${base}/program/speakers?selected=${speaker._id}`, severity: "attention" as const }] : []),
      ]);

    const unscheduled: ControlRoomItem[] = accepted
      .filter((submission) => !scheduledSubmissionIds.has(String(submission._id)))
      .map((submission) => ({ id: String(submission._id), kind: "unscheduled", title: titleOf(submission), detail: "Accepted session has no agenda slot.", href: `${base}/program/agenda?submission=${submission._id}&mode=add`, severity: "blocking" }));

    const blockingConflicts = conflictRows(agenda).filter((conflict) => conflict.reason === "room_overlap" || conflict.reason === "speaker_overlap");
    const conflicts: ControlRoomItem[] = blockingConflicts.map((conflict) => {
      const first = agenda.find((item) => item._id === conflict.itemA)!;
      const second = agenda.find((item) => item._id === conflict.itemB)!;
      const label = conflict.reason === "room_overlap" ? "Room conflict" : "Speaker conflict";
      return { id: `${conflict.reason}-${first._id}-${second._id}`, kind: "conflicts", title: `${label}: ${first.title}`, detail: `Overlaps with ${second.title}.`, href: `${base}/program/agenda?view=conflicts&selected=${first._id}`, severity: "blocking" };
    });

    const recordingCoverage: ControlRoomItem[] = agenda
      .filter((item) => item.endTime < now)
      .flatMap((item) => {
        const recording = activeRecordings.get(item._id);
        if (recording && recording.availability !== "unavailable") return [];
        return [{
          id: `recording-${item._id}`,
          kind: "recording_coverage" as const,
          title: recording ? `Unavailable recording: ${item.title}` : `Recording missing: ${item.title}`,
          detail: "This completed session needs an attendee-ready recording.",
          href: `${base}/program/recordings?selected=${item._id}&filter=${recording ? "attention" : "missing"}`,
          severity: "attention" as const,
        }];
      });

    const publicationBlockers: ControlRoomItem[] = [
      ...conflicts.map((item) => ({ ...item, id: `publish-${item.id}`, kind: "publication_blockers" as const })),
      ...unscheduled.map((item) => ({ ...item, id: `publish-${item.id}`, kind: "publication_blockers" as const })),
      ...missingAssets.filter((item) => item.id.startsWith("headshot-")).map((item) => ({ ...item, id: `publish-${item.id}`, kind: "publication_blockers" as const })),
      ...agenda.filter((item) => !item.isPublished).slice(0, conflicts.length || unscheduled.length ? 0 : 1).map((item) => ({ id: `publish-agenda-${item._id}`, kind: "publication_blockers" as const, title: "Agenda is still a draft", detail: "Publish the reviewed agenda when all blockers are clear.", href: `${base}/program/agenda?selected=${item._id}`, severity: "attention" as const })),
    ];

    const categories = { decisions, reviews, acceptance_emails: acceptanceEmails, overdue_tasks: overdueTasks, missing_assets: missingAssets, unscheduled, conflicts, recording_coverage: recordingCoverage, publication_blockers: publicationBlockers };
    // Seeded records make the Control Room useful immediately, but they must not make the
    // walkthrough look completed before a judge does anything. Public CFP submissions have no
    // `demo:seed:*` sourceRef, so the newest such record becomes this reset's guided record.
    const walkthroughSubmission = [...submissions]
      .filter((submission) => !submission.sourceRef?.startsWith("demo:seed:"))
      .sort((left, right) => right.createdAt - left.createdAt)[0];
    const walkthroughAssignmentIds = new Set(assignments
      .filter((assignment) => assignment.submissionId === walkthroughSubmission?._id)
      .map((assignment) => String(assignment._id)));
    const walkthroughReviewed = evaluations.some((review) => review.assignmentId && walkthroughAssignmentIds.has(String(review.assignmentId)) && (review.score !== undefined || Boolean(review.criteriaScores?.length)));
    const walkthroughScheduled = walkthroughSubmission ? scheduledSubmissionIds.has(String(walkthroughSubmission._id)) : false;
    const walkthroughAgendaItem = walkthroughSubmission ? agenda.find((item) => item.submissionId === walkthroughSubmission._id) : undefined;
    const speakerGalleryEnabled = embeds.some((embed) => embed.view === "speaker_gallery" && embed.enabled);
    const walkthroughNotified = walkthroughSubmission ? notifiedSubmissionIds.has(String(walkthroughSubmission._id)) : false;
    const walkthroughTaskDone = walkthroughSubmission ? tasks.some((task) => task.submissionId === walkthroughSubmission._id && task.status === "completed") : false;
    const walkthroughFileUploaded = walkthroughSubmission ? documents.some((document) => document.submissionId === walkthroughSubmission._id) : false;
    const walkthroughFormId = walkthroughSubmission?.formId ?? forms.find((form) => form.status === "open")?._id;

    return {
      generatedAt: now,
      categories,
      walkthrough: [
        { id: "submit", label: "Submit through the conditional CFP", complete: Boolean(walkthroughSubmission), href: walkthroughFormId ? `/submit/${event.slug}/${walkthroughFormId}` : `${base}/program/forms` },
        { id: "review", label: "Score it as a reviewer", complete: walkthroughReviewed, href: walkthroughSubmission ? `${base}/program/evaluation` : `/submit/${event.slug}/${walkthroughFormId ?? ""}` },
        { id: "accept", label: "Accept without notifying", complete: walkthroughSubmission?.status === "accepted", href: walkthroughSubmission ? `${base}/program/abstracts?selected=${walkthroughSubmission._id}` : `${base}/program/abstracts` },
        { id: "speaker-task", label: "Complete a speaker task and upload a file", complete: walkthroughTaskDone && walkthroughFileUploaded, href: `/portal` },
        { id: "schedule", label: "Schedule the accepted session", complete: walkthroughScheduled, href: walkthroughSubmission && !walkthroughScheduled ? `${base}/program/agenda?submission=${walkthroughSubmission._id}&mode=add` : `${base}/program/agenda` },
        { id: "resolve", label: "Detect and resolve the conflict", complete: agenda.length > 1 && conflicts.length === 0, href: `${base}/program/agenda?view=conflicts` },
        { id: "notify", label: "Send the reviewed acceptance and calendar invite", complete: walkthroughNotified, href: walkthroughSubmission ? `${base}/program/abstracts?selected=${walkthroughSubmission._id}` : `${base}/program/communications` },
        { id: "publish", label: "Publish the agenda and speaker gallery", complete: walkthroughAgendaItem?.isPublished === true && speakerGalleryEnabled, href: walkthroughAgendaItem?.isPublished === false ? `${base}/program/agenda?selected=${walkthroughAgendaItem._id}` : `${base}/cms/embeds` },
      ],
    };
  },
});
