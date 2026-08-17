import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query, assertEventOrganizerAccess } from "./functions";
import { internalMutation } from "./_generated/server";
import { assertOrganizerOrOwnsSpeaker } from "./speakers";
import { eventOrganizers, notifyEvent } from "./notifications";
import {
  assertAnswers,
  evaluateEditability,
  mergeEditableAnswers,
  readEditableAnswers,
  requireOwnSubmission,
} from "./submissionEditing";

const submissionStatus = v.union(
  v.literal("draft"),
  v.literal("pending"),
  v.literal("accept_queue"),
  v.literal("accepted"),
  v.literal("maybe"),
  v.literal("decline_queue"),
  v.literal("declined"),
  v.literal("withdrawn"),
);

const submissionInput = {
  eventId: v.id("events"),
  formId: v.id("submission_forms"),
  email: v.string(),
  firstName: v.string(),
  lastName: v.string(),
  title: v.string(),
  answers: v.any(),
};

export const list = query({
  args: { eventId: v.id("events"), speakerId: v.optional(v.id("speakers")) },
  handler: async (ctx, args) => {
    if (args.speakerId) {
      await assertOrganizerOrOwnsSpeaker(ctx, args.eventId, args.speakerId);
      const submissions = await ctx.db
        .query("submissions")
        .withIndex("by_speaker", (q) => q.eq("speakerId", args.speakerId))
        .collect();
      return Promise.all(
        submissions
          .filter((submission) => submission.eventId === args.eventId)
          .map(async (submission) => {
            const form = await ctx.db.get(submission.formId);
            return {
              ...submission,
              editability: form
                ? evaluateEditability(submission, form, Date.now())
                : {
                    editable: false as const,
                    reason: "submissions_closed" as const,
                  },
            };
          }),
      );
    }
    await assertEventOrganizerAccess(ctx, args.eventId);
    return ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});

export async function validateForm(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  formId: Id<"submission_forms">,
) {
  const form = await ctx.db.get(formId);
  if (!form || form.eventId !== eventId)
    throw new Error("Submission form was not found for this event.");
  if (form.kind !== "abstract" && form.kind !== "session")
    throw new Error("This form is only available in the speaker portal.");
  if (form.status !== "open")
    throw new Error("This submission form is not accepting responses.");
  if (form.closeDate && form.closeDate < Date.now())
    throw new Error("This submission form is closed.");
  return form;
}

export async function findOrCreateSpeaker(
  ctx: MutationCtx,
  input: {
    eventId: Id<"events">;
    email: string;
    firstName: string;
    lastName: string;
  },
) {
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email))
    throw new Error("A valid email address is required.");
  const speaker = await ctx.db
    .query("speakers")
    .withIndex("by_event_email", (q) =>
      q.eq("eventId", input.eventId).eq("email", email),
    )
    .unique();
  const now = Date.now();
  if (speaker) {
    await ctx.db.patch(speaker._id, {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      updatedAt: now,
    });
    return speaker._id;
  }
  return ctx.db.insert("speakers", {
    eventId: input.eventId,
    email,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
}

export const submit = mutation({
  args: { input: v.object(submissionInput) },
  handler: async (ctx, { input }) => {
    await assertEventOrganizerAccess(ctx, input.eventId);
    if (!input.title.trim()) throw new Error("A submission title is required.");
    const form = await validateForm(ctx, input.eventId, input.formId);
    const existing = await ctx.db
      .query("submissions")
      .withIndex("by_form", (q) => q.eq("formId", input.formId))
      .collect();
    const submittedByEmail = existing.filter(
      (submission) =>
        submission.status !== "draft" &&
        (submission.answers as { email?: string }).email?.toLowerCase() ===
          input.email.trim().toLowerCase(),
    );
    if (form.submissionLimit && submittedByEmail.length >= form.submissionLimit)
      throw new Error("You have reached this form's submission limit.");
    const speakerId = await findOrCreateSpeaker(ctx, input);
    const now = Date.now();
    const submissionId = await ctx.db.insert("submissions", {
      eventId: input.eventId,
      formId: input.formId,
      speakerId,
      title: input.title.trim(),
      status: "pending",
      answers: { ...input.answers, email: input.email.trim().toLowerCase() },
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const event = await ctx.db.get(input.eventId);
    await notifyEvent(ctx, {
      eventId: input.eventId,
      kind: "submission_received",
      title: "New submission received",
      body: input.title.trim(),
      linkPath: event ? `/events/${event.slug}/program/abstracts?selected=${submissionId}` : undefined,
      relatedId: submissionId,
      recipientUserIds: await eventOrganizers(ctx, input.eventId),
    });
    return submissionId;
  },
});

export const saveDraft = mutation({
  args: { input: v.object(submissionInput) },
  handler: async (ctx, { input }) => {
    await assertEventOrganizerAccess(ctx, input.eventId);
    await validateForm(ctx, input.eventId, input.formId);
    const speakerId = await findOrCreateSpeaker(ctx, input);
    const now = Date.now();
    return ctx.db.insert("submissions", {
      eventId: input.eventId,
      formId: input.formId,
      speakerId,
      title: input.title.trim(),
      status: "draft",
      answers: { ...input.answers, email: input.email.trim().toLowerCase() },
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Admin-created abstracts are not public responses: a form may be closed and no speaker is
// invented. The form lookup still prevents a row from being attached across events.
export const createAdmin = mutation({
  args: {
    input: v.object({
      eventId: v.id("events"),
      formId: v.id("submission_forms"),
      title: v.string(),
      description: v.optional(v.string()),
      status: submissionStatus,
    }),
  },
  handler: async (ctx, { input }) => {
    await assertEventOrganizerAccess(ctx, input.eventId);
    if (!input.title.trim()) throw new Error("An abstract title is required.");
    const form = await ctx.db.get(input.formId);
    if (!form || form.eventId !== input.eventId)
      throw new Error("Submission form was not found for this event.");
    if (form.kind !== "abstract" && form.kind !== "session")
      throw new Error("Choose an abstract or session form.");
    const now = Date.now();
    const id = await ctx.db.insert("submissions", {
      eventId: input.eventId,
      formId: input.formId,
      title: input.title.trim(),
      status: input.status,
      answers: input.description?.trim()
        ? { description: input.description.trim() }
        : {},
      submittedAt: input.status === "draft" ? undefined : now,
      createdAt: now,
      updatedAt: now,
    });
    const submission = await ctx.db.get(id);
    if (!submission) throw new Error("Could not create abstract.");
    return submission;
  },
});

export const decide = mutation({
  args: {
    submissionId: v.id("submissions"),
    status: v.union(v.literal("accepted"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) throw new Error("Submission not found.");
    await assertEventOrganizerAccess(ctx, submission.eventId);
    const now = Date.now();
    await ctx.db.patch(args.submissionId, {
      status: args.status,
      updatedAt: now,
    });
    if (args.status === "accepted" && submission.speakerId) {
      const event = await ctx.db.get(submission.eventId);
      const template = event?.defaultOnboardingTemplateId
        ? await ctx.db.get(event.defaultOnboardingTemplateId)
        : null;
      const taskItems: Array<{
        title: string;
        targetType: "contact" | "group" | "submission" | "sponsor";
        description?: string;
        linkedFormId?: Id<"submission_forms">;
        dueDateOffsetDays?: number;
      }> =
        template?.items ??
        [
          "Upload headshot",
          "Confirm bio",
          "Upload slides",
          "Sign speaker agreement",
        ].map((title) => ({ title, targetType: "submission" as const }));
      const existing = await ctx.db
        .query("onboarding_tasks")
        .withIndex("by_submission", (q) =>
          q.eq("submissionId", args.submissionId),
        )
        .collect();
      await Promise.all(
        taskItems
          .filter(
            (item) =>
              item.targetType !== "sponsor" &&
              !existing.some(
                (task) => task.source === "auto" && task.title === item.title,
              ),
          )
          .map((item) =>
            ctx.db.insert("onboarding_tasks", {
              eventId: submission.eventId,
              targetType: item.targetType,
              submissionId: args.submissionId,
              speakerId: submission.speakerId,
              title: item.title,
              ...(item.description ? { description: item.description } : {}),
              ...(item.linkedFormId ? { linkedFormId: item.linkedFormId } : {}),
              ...(item.dueDateOffsetDays !== undefined
                ? { dueDate: now + item.dueDateOffsetDays * 86_400_000 }
                : {}),
              source: "auto",
              status: "pending",
              createdAt: now,
              updatedAt: now,
            }),
          ),
      );
    }
    const event = await ctx.db.get(submission.eventId);
    await notifyEvent(ctx, {
      eventId: submission.eventId,
      kind: "decision_sent",
      title: `Submission ${args.status}`,
      body: submission.title,
      linkPath: event ? `/events/${event.slug}/program/abstracts?selected=${args.submissionId}` : undefined,
      relatedId: args.submissionId,
      recipientUserIds: await eventOrganizers(ctx, submission.eventId),
    });
    return { ...submission, status: args.status };
  },
});

export const setStatus = mutation({
  args: { submissionId: v.id("submissions"), status: submissionStatus },
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) throw new Error("Submission not found.");
    await assertEventOrganizerAccess(ctx, submission.eventId);
    await ctx.db.patch(args.submissionId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    if (args.status === "withdrawn" && submission.status !== "withdrawn") {
      const event = await ctx.db.get(submission.eventId);
      await notifyEvent(ctx, {
        eventId: submission.eventId,
        kind: "submission_withdrawn",
        title: "Submission withdrawn",
        body: submission.title,
        linkPath: event ? `/events/${event.slug}/program/abstracts?selected=${args.submissionId}` : undefined,
        relatedId: args.submissionId,
        recipientUserIds: await eventOrganizers(ctx, submission.eventId),
      });
    }
  },
});

export const setTags = mutation({
  args: {
    eventId: v.id("events"),
    submissionId: v.id("submissions"),
    tagIds: v.array(v.id("tags")),
  },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const submission = await ctx.db.get(args.submissionId);
    if (!submission || submission.eventId !== args.eventId)
      throw new Error("Submission not found for this event.");
    const tagIds = [...new Set(args.tagIds)];
    const tags = await Promise.all(tagIds.map((tagId) => ctx.db.get(tagId)));
    if (tags.some((tag) => !tag || tag.eventId !== args.eventId)) {
      throw new Error("Every selected tag must belong to this event.");
    }
    await ctx.db.patch(args.submissionId, { tagIds, updatedAt: Date.now() });
  },
});

export const getForSpeaker = query({
  args: {
    eventId: v.id("events"),
    submissionId: v.id("submissions"),
    speakerId: v.id("speakers"),
  },
  handler: async (ctx, args) => {
    const submission = await requireOwnSubmission(ctx, args);
    const form = await ctx.db.get(submission.formId);
    if (
      !form ||
      form.eventId !== args.eventId ||
      (form.kind !== "abstract" && form.kind !== "session")
    ) {
      throw new Error("That submission is not available on your portal.");
    }
    const section = form.sections.find((item) => item.key === "abstract");
    const fieldIds = section?.fieldIds ?? [];
    const fieldsById = new Map(
      (await ctx.db.query("field_definitions").collect()).map((field) => [
        String(field._id),
        field,
      ]),
    );
    const fields = fieldIds.flatMap((id) => {
      const field = fieldsById.get(id);
      return field ? [field] : [];
    });
    const { answers, archivedAnswers } = readEditableAnswers(
      submission.answers,
      fields,
    );
    const titleField =
      fields.find((field) => /title|session/i.test(field.label)) ?? fields[0];
    if (titleField && !answers[String(titleField._id)])
      answers[String(titleField._id)] = submission.title;
    return {
      submission,
      form: {
        title: form.externalTitle,
        sectionTitle: section?.title ?? "Proposal",
        ...(section?.description ? { description: section.description } : {}),
        fields: fields.map((field) => ({
          id: String(field._id),
          label: field.label,
          type: field.type,
          required: field.required,
          ...(field.maxChars !== undefined ? { maxChars: field.maxChars } : {}),
          ...(field.options ? { options: field.options } : {}),
          ...(field.showIf ? { showIf: field.showIf } : {}),
        })),
        crossFieldLimits: form.crossFieldLimits.filter(
          (limit) => !limit.perParticipant,
        ),
      },
      answers,
      archivedAnswers,
      editability: evaluateEditability(submission, form, Date.now()),
    };
  },
});

export const updateBySpeaker = mutation({
  args: {
    eventId: v.id("events"),
    submissionId: v.id("submissions"),
    speakerId: v.id("speakers"),
    title: v.string(),
    answers: v.record(v.string(), v.string()),
    submit: v.boolean(),
  },
  handler: async (ctx, args) => {
    const submission = await requireOwnSubmission(ctx, args);
    const form = await ctx.db.get(submission.formId);
    if (
      !form ||
      form.eventId !== args.eventId ||
      (form.kind !== "abstract" && form.kind !== "session")
    )
      throw new Error("That submission is not available on your portal.");
    const editability = evaluateEditability(submission, form, Date.now());
    if (!editability.editable)
      throw new Error("This proposal can no longer be edited.");
    const section = form.sections.find((item) => item.key === "abstract");
    const fieldIds = new Set(section?.fieldIds ?? []);
    const fields = (await ctx.db.query("field_definitions").collect()).filter(
      (field) => fieldIds.has(String(field._id)),
    );
    const submittingDraft = args.submit && submission.status === "draft";
    const requireRequired = submission.status !== "draft" || submittingDraft;
    assertAnswers({
      fields,
      crossFieldLimits: form.crossFieldLimits.filter(
        (limit) => !limit.perParticipant,
      ),
      answers: args.answers,
      title: args.title,
      requireRequired,
    });
    const now = Date.now();
    const speakerEditCount = (submission.speakerEditCount ?? 0) + 1;
    const status = submittingDraft ? "pending" : submission.status;
    await ctx.db.patch(submission._id, {
      title: args.title.trim(),
      answers: mergeEditableAnswers(submission.answers, args.answers),
      status,
      ...(submittingDraft ? { submittedAt: now } : {}),
      updatedAt: now,
      lastSpeakerEditAt: now,
      speakerEditCount,
    });
    return { status, updatedAt: now, lastSpeakerEditAt: now, speakerEditCount };
  },
});

// Content-integration import path (Notion, and later Airtable/Sanity): create-or-update keyed
// on `eventId` + `sourceRef` so re-running an import never duplicates a row. Internal-only —
// callers (the contentIntegrationsActions import actions) are already organizer-checked.
export const upsertBySourceRef = internalMutation({
  args: {
    eventId: v.id("events"),
    formId: v.id("submission_forms"),
    sourceRef: v.string(),
    title: v.string(),
    status: submissionStatus,
    answers: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("submissions")
      .withIndex("by_event_sourceRef", (q) => q.eq("eventId", args.eventId).eq("sourceRef", args.sourceRef))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        status: args.status,
        answers: { ...existing.answers, ...args.answers },
        updatedAt: now,
      });
      return { id: existing._id, created: false };
    }
    const id = await ctx.db.insert("submissions", {
      eventId: args.eventId,
      formId: args.formId,
      sourceRef: args.sourceRef,
      title: args.title,
      status: args.status,
      answers: args.answers,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { id, created: true };
  },
});
