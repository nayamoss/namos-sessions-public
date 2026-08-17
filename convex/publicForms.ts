import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { createRoutingAssignments, resolveSubmissionRouting } from "./categoryRouting";
import { mutation, query } from "./functions";
import { findOrCreateSpeaker, validateForm } from "./submissions";
import { assertCrossFieldLimits, assertParticipantRoleBounds } from "./publicFormValidation";

export const listOpen = query({
  args: { eventSlug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (query) => query.eq("slug", args.eventSlug))
      .first();
    if (!event || event.status !== "published") return [];
    const now = Date.now();
    const forms = await ctx.db
      .query("submission_forms")
      .withIndex("by_event", (query) => query.eq("eventId", event._id))
      .collect();
    return forms
      .filter(
        (form) =>
          form.status === "open" &&
          (form.kind === "abstract" || form.kind === "session") &&
          (form.closeDate === undefined || form.closeDate > now),
      )
      .map((form) => ({ id: form._id, title: form.externalTitle }));
  },
});

// The browser receives a purpose-built public form model, rather than a client-side filtered
// organizer record. Database ids, internal names, notifications, and admin lists stay server-side.
export const get = query({
  args: { eventSlug: v.string(), formId: v.id("submission_forms") },
  handler: async (ctx, args) => {
    const event = await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", args.eventSlug)).first();
    if (!event || event.status !== "published") return null;

    const form = await ctx.db.get(args.formId);
    if (!form || form.eventId !== event._id || (form.kind !== "abstract" && form.kind !== "session") || form.status !== "open" || (form.closeDate !== undefined && form.closeDate <= Date.now())) return null;

    const fieldIds = [...new Set(form.sections.flatMap((section: { fieldIds: string[] }) => section.fieldIds))] as string[];
    const fieldsById = new Map((await ctx.db.query("field_definitions").collect()).map((field) => [field._id as string, field]));
    const fieldKeyById = new Map(fieldIds.filter((id) => fieldsById.has(id)).map((id, index) => [id, `field-${index + 1}`]));

    const fields = fieldIds.flatMap((id) => {
      const field = fieldsById.get(id);
      const key = fieldKeyById.get(id);
      if (!field || !key) return [];
      const showIfKey = field.showIf ? fieldKeyById.get(field.showIf.fieldId) : undefined;
      return [{
        key, label: field.label, type: field.type, required: field.required,
        ...(field.maxChars !== undefined ? { maxChars: field.maxChars } : {}),
        ...(field.options ? { options: field.options } : {}),
        ...(field.showIf && showIfKey ? { showIf: { fieldKey: showIfKey, equals: field.showIf.equals } } : {}),
      }];
    });

    return {
      event: { name: event.name, slug: event.slug, timezone: event.timezone, startDate: event.startDate, endDate: event.endDate },
      form: {
        externalTitle: form.externalTitle,
        pageHeading: form.pageHeading,
        kind: form.kind,
        collectParticipants: form.collectParticipants,
        ...(form.welcomeMessage ? { welcomeMessage: form.welcomeMessage } : {}),
        showWelcomeMessage: form.showWelcomeMessage,
        sections: form.sections.map((section) => ({
          key: section.key,
          title: section.title,
          pageHeading: section.pageHeading,
          ...(section.description ? { description: section.description } : {}),
          fieldKeys: section.fieldIds.flatMap((id) => fieldKeyById.get(id) ?? []),
        })),
        participantRoles: form.participantRoles.map((role) => ({ role: role.role, ...(role.min !== undefined ? { min: role.min } : {}), ...(role.max !== undefined ? { max: role.max } : {}) })),
        crossFieldLimits: form.crossFieldLimits.flatMap((limit, index) => {
          const fieldKeys = limit.fieldIds.flatMap((id) => fieldKeyById.get(id) ?? []);
          return fieldKeys.length ? [{ key: `limit-${index + 1}`, label: limit.label, fieldKeys, maxCombinedChars: limit.maxCombinedChars, perParticipant: limit.perParticipant }] : [];
        }),
        ...(form.closeDate !== undefined ? { closeDate: form.closeDate } : {}),
        ...(form.submissionLimit !== undefined ? { submissionLimit: form.submissionLimit } : {}),
        allowMultipleDrafts: form.allowMultipleDrafts,
        autoRedirectToPortal: form.autoRedirectToPortal,
        ...(form.successPageMessage ? { successPageMessage: form.successPageMessage } : {}),
        confirmationEnabled: form.sendSubmitterConfirmation,
        fields,
      },
    };
  },
});

const choiceFieldTypes = new Set(["dropdown", "multiselect", "select", "radio", "checkbox"]);

const publicFormSubmissionInput = v.object({
  eventSlug: v.string(),
  formId: v.id("submission_forms"),
  idempotencyKey: v.string(),
  // firstName/lastName are what the submission form now collects. `name` stays accepted
  // for the public HTTP API, which predates the split — but it is no longer how the
  // browser client submits.
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  name: v.optional(v.string()),
  email: v.string(),
  title: v.string(),
  answers: v.record(v.string(), v.string()),
  abstractFieldKey: v.optional(v.string()),
  participants: v.optional(v.array(v.object({ role: v.string(), answers: v.record(v.string(), v.string()), availability: v.optional(v.object({ unavailable: v.array(v.object({ date: v.number(), hour: v.optional(v.number()), part: v.optional(v.union(v.literal("morning"), v.literal("afternoon"), v.literal("evening"))) })), notes: v.optional(v.string()) })) }))),
});

// Only the secret-authenticated Convex HTTP handoff may reach this write. Browser clients submit
// through the same-origin Cloudflare Worker, which verifies Turnstile and distributed limits first.
export const submit = internalMutation({
  args: {
    input: publicFormSubmissionInput,
    verifiedIdentityEmail: v.optional(v.string()),
  },
  handler: async (ctx, { input, verifiedIdentityEmail }) => {
    const event = await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", input.eventSlug)).first();
    if (!event || event.status !== "published") throw new Error("This call for proposals is not available.");

    const form = await validateForm(ctx, event._id, input.formId);
    const idempotencyKey = input.idempotencyKey.trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) throw new Error("Submission retry key is invalid.");
    const existingSubmission = await ctx.db.query("submissions")
      .withIndex("by_form_idempotency", (query) => query.eq("formId", form._id).eq("idempotencyKey", idempotencyKey))
      .unique();
    // A retry is still this speaker's submission, so it hands off the same id.
    // Only the confirmation is not reissued — that already happened on the
    // first call, and reissuing it would mail the speaker twice.
    if (existingSubmission) return { speakerId: existingSubmission.speakerId };

    const sections = form.sections as Array<{ key: string; fieldIds: string[] }>;
    const fieldIds: string[] = Array.from(new Set(sections.flatMap((section) => section.fieldIds)));
    const participantFieldIds = new Set(sections.filter((section) => section.key === "participant").flatMap((section) => section.fieldIds));
    const fieldsById = new Map((await ctx.db.query("field_definitions").collect()).map((field) => [field._id as string, field]));
    const fieldKeyById = new Map(fieldIds.filter((id) => fieldsById.has(id)).map((id, index) => [id, `field-${index + 1}`]));
    const keyEntries = [...fieldKeyById.entries()].map(([id, key]) => ({ id, key, field: fieldsById.get(id)! }));
    const submittedAnswers = input.answers as Record<string, string>;
    const participants = input.participants ?? [];
    const submissionEntries = keyEntries.filter((entry) => !participantFieldIds.has(entry.id));
    const participantEntries = keyEntries.filter((entry) => participantFieldIds.has(entry.id));
    const abstractEntry = input.abstractFieldKey ? submissionEntries.find((entry) => entry.key === input.abstractFieldKey) : undefined;
    if (input.abstractFieldKey && !abstractEntry) throw new Error("The submission identifies an unknown abstract field.");

    const validateAnswers = (entries: typeof keyEntries, answers: Record<string, string>) => {
      for (const key of Object.keys(answers)) {
        if (!entries.some((entry) => entry.key === key)) throw new Error("The submission contains an unknown form field.");
      }
      for (const entry of entries) {
        const value = answers[entry.key] ?? "";
        const visible = !entry.field.showIf || fieldKeyById.get(entry.field.showIf.fieldId) === undefined || answers[fieldKeyById.get(entry.field.showIf.fieldId)!] === entry.field.showIf.equals;
        // A choice field draws its options from event config (Track from the event's tracks).
        // When none exist the field renders as an empty dropdown, so requiring an answer
        // makes the form permanently unsubmittable. Mirrors the client-side rule in
        // src/lib/field-answerable.ts — the two must agree or the client lets a submission
        // through that the server then rejects.
        const answerable = !choiceFieldTypes.has(entry.field.type) || (entry.field.options?.length ?? 0) > 0;
        if (visible && entry.field.required && answerable && !value.trim()) throw new Error(`${entry.field.label} is required.`);
        if (entry.field.maxChars !== undefined && value.length > entry.field.maxChars) throw new Error(`${entry.field.label} exceeds its character limit.`);
      }
    };
    validateAnswers(submissionEntries, submittedAnswers);
    assertCrossFieldLimits(form.crossFieldLimits.filter((limit) => !limit.perParticipant), fieldKeyById, submittedAnswers);
    if (!form.collectParticipants && participants.length) throw new Error("This form does not collect participants.");
    if (form.collectParticipants) {
      assertParticipantRoleBounds(form.participantRoles, participants);
      for (const participant of participants) {
        validateAnswers(participantEntries, participant.answers);
        assertCrossFieldLimits(form.crossFieldLimits.filter((limit) => limit.perParticipant), fieldKeyById, participant.answers);
        const availability = participant.availability;
        if (availability) {
          if (availability.notes && availability.notes.length > 1_000) throw new Error("Availability notes must be 1,000 characters or fewer.");
          const firstDate = Date.UTC(new Date(event.startDate).getUTCFullYear(), new Date(event.startDate).getUTCMonth(), new Date(event.startDate).getUTCDate());
          const lastDate = Date.UTC(new Date(event.endDate).getUTCFullYear(), new Date(event.endDate).getUTCMonth(), new Date(event.endDate).getUTCDate());
          const keys = new Set<string>();
          for (const slot of availability.unavailable) {
            if (!Number.isFinite(slot.date) || slot.date < firstDate || slot.date > lastDate || slot.date !== Date.UTC(new Date(slot.date).getUTCFullYear(), new Date(slot.date).getUTCMonth(), new Date(slot.date).getUTCDate())) throw new Error("Availability must use a day within this event.");
            if (slot.hour === undefined && slot.part === undefined) throw new Error("Each unavailable slot needs an hour.");
            if (slot.hour !== undefined && (!Number.isInteger(slot.hour) || slot.hour < 0 || slot.hour > 23)) throw new Error("Availability hours must be between 0 and 23.");
            const key = slot.hour !== undefined ? `${slot.date}:hour:${slot.hour}` : `${slot.date}:part:${slot.part}`;
            if (keys.has(key)) throw new Error("Availability cannot include the same time twice.");
            keys.add(key);
          }
        }
      }
    }

    const email = input.email.trim().toLowerCase();
    const name = (input.name ?? "").trim();
    const givenFirstName = (input.firstName ?? "").trim();
    const givenLastName = (input.lastName ?? "").trim();
    if ((!givenFirstName && !name) || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("A name and valid email address are required.");
    if (!input.title.trim()) throw new Error("A submission title is required.");
    // The CFP's Account step verifies the submitter's email via Clerk before this call. If a
    // Clerk session is present (the normal case), it must be the same email — a signed-in
    // caller cannot claim to be a different, unverified address. Submissions without any Clerk
    // session are still accepted (e.g. embedded/API callers, or a form with verification
    // skipped), just without this extra check; findOrCreateSpeaker's own validation still applies.
    if (verifiedIdentityEmail && verifiedIdentityEmail.toLowerCase() !== email) throw new Error("The submitted email must match your verified email address.");

    const existingSubmissions = await ctx.db.query("submissions").withIndex("by_form", (q) => q.eq("formId", form._id)).collect();
    const submittedByEmail = existingSubmissions.filter((submission) => submission.status !== "draft" && (submission.answers as { email?: string }).email?.toLowerCase() === email);
    if (form.submissionLimit && submittedByEmail.length >= form.submissionLimit) throw new Error("You have reached this form's submission limit.");

    const now = Date.now();
    // Splitting a single free-text name is only a fallback for the legacy `name` API field.
    // It never invents a surname: a one-word name yields an empty last name rather than the
    // literal "Speaker", which used to be written into real speaker records.
    const [splitFirstName, ...splitRest] = name.split(/\s+/);
    const firstName = givenFirstName || splitFirstName;
    const lastName = givenFirstName ? givenLastName : splitRest.join(" ");
    const speakerId = await findOrCreateSpeaker(ctx, { eventId: event._id, email, firstName, lastName });

    const fieldValues = Object.fromEntries(submissionEntries.map((entry) => [entry.id, submittedAnswers[entry.key] ?? ""]));
    const fieldLabels = Object.fromEntries(submissionEntries.map((entry) => [entry.id, entry.field.label]));
    const participantFieldLabels = Object.fromEntries(participantEntries.map((entry) => [entry.id, entry.field.label]));
    const participantValues = participants.map((participant) => ({
      role: participant.role,
      fieldValues: Object.fromEntries(participantEntries.map((entry) => [entry.id, participant.answers[entry.key] ?? ""])),
      availability: participant.availability ? { unavailable: participant.availability.unavailable, ...(participant.availability.notes?.trim() ? { notes: participant.availability.notes.trim() } : {}) } : undefined,
    }));
    const routing = await resolveSubmissionRouting(ctx, event._id, form.sections, form.routingRules, fieldKeyById, submittedAnswers);
    const submissionId = await ctx.db.insert("submissions", {
      eventId: event._id,
      formId: form._id,
      idempotencyKey,
      speakerId,
      ...(routing.assignTagIds?.length ? { tagIds: routing.assignTagIds } : {}),
      ...(routing.assignTrackId ? { trackId: routing.assignTrackId } : {}),
      ...(routing.assignSponsorId ? { sponsorId: routing.assignSponsorId } : {}),
      title: input.title.trim(),
      status: routing.setStatus ?? "pending",
      answers: { email, fieldValues, fieldLabels, ...(abstractEntry ? { abstractFieldId: abstractEntry.id } : {}), participantFieldLabels, participantValues },
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await createRoutingAssignments(ctx, event._id, submissionId, routing.reviewerUserIds, now);
    // This data model has one canonical speaker per public submission. Keep every
    // participant's availability with the submission, then project the first listed
    // participant onto that speaker's profile for scheduling and later portal edits.
    const primaryAvailability = participants[0]?.availability;
    if (primaryAvailability) {
      const current = await ctx.db.query("speaker_availability").withIndex("by_speaker", (q) => q.eq("speakerId", speakerId)).first();
      const values = { unavailable: primaryAvailability.unavailable, notes: primaryAvailability.notes?.trim() || undefined, updatedAt: now };
      if (current) await ctx.db.patch(current._id, values);
      else await ctx.db.insert("speaker_availability", { eventId: event._id, speakerId, ...values, createdAt: now });
    }
    // The token is intentionally the only post-submit *delivery* value returned to
    // the browser. The delivery action resolves event, speaker, submission, and
    // recipient server-side before it sends or records the confirmation.
    //
    // speakerId is returned alongside it for a different purpose: the portal
    // redirect. It releases no recipient or submission record, and the portal
    // only honours it if it matches a speaker already listed for the event.
    if (!form.sendSubmitterConfirmation) return { speakerId };
    // Write the comms_log row now, while eventId/submissionId/speakerId/email are all
    // still guaranteed to exist. Every later step (deployment secret, provider config,
    // the send itself) can fail or never run, but this row already proves an attempt
    // happened. If nothing downstream ever runs, it just stays "queued" — visible,
    // not silent. See #46: the previous design only logged after a step that could
    // itself fail, so a failure at or before that step logged nothing at all.
    const commsLogId = await ctx.db.insert("comms_log", {
      eventId: event._id,
      submissionId,
      speakerId,
      channel: "email",
      status: "queued",
      toEmail: email,
      subject: `We received your submission for ${event.name}`,
      createdAt: now,
    });
    // Convex supplies deterministic-but-per-invocation entropy through Math.random() in
    // mutations, so retries retain the same token while distinct submissions do not.
    const confirmationToken = Array.from({ length: 6 }, () => Math.random().toString(36).slice(2)).join("");
    await ctx.db.insert("submission_confirmation_requests", {
      token: confirmationToken,
      eventId: event._id,
      submissionId,
      speakerId,
      commsLogId,
      createdAt: now,
    });
    // Delivery belongs to the durable server-side workflow, not to a best-effort browser
    // fetch that can be cancelled by the success-page redirect or unavailable in Vite dev.
    // The action resolves the event's encrypted provider configuration and always finalizes
    // the queued comms_log row as sent or failed.
    await ctx.scheduler.runAfter(0, internal.confirmationEmailActions.deliver, { confirmationToken });
    return { speakerId };
  },
});

async function claimConfirmationRequest(ctx: MutationCtx, confirmationToken: string) {
  const request = await ctx.db.query("submission_confirmation_requests").withIndex("by_token", (q) => q.eq("token", confirmationToken)).unique();
  if (!request || request.consumedAt) return null;

  const [event, submission, speaker] = await Promise.all([
    ctx.db.get(request.eventId),
    ctx.db.get(request.submissionId),
    ctx.db.get(request.speakerId),
  ]);
  if (!event || !submission || !speaker || submission.eventId !== request.eventId || speaker.eventId !== request.eventId) {
    throw new Error("Confirmation delivery context is no longer available.");
  }
  await ctx.db.patch(request._id, { consumedAt: Date.now() });
  return {
    eventId: request.eventId,
    submissionId: request.submissionId,
    speakerId: request.speakerId,
    commsLogId: request.commsLogId,
    toEmail: speaker.email,
    speakerName: `${speaker.firstName} ${speaker.lastName}`.trim(),
    eventName: event.name,
    sessionTitle: submission.title,
  };
}

// This public function is callable by the delivery handler, but its second argument is
// a server-only shared secret. A token alone never releases a record id or recipient to
// the browser. Claiming before delivery makes duplicate browser/function retries harmless.
export const claimConfirmation = mutation({
  args: { confirmationToken: v.string(), deliverySecret: v.string() },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.CONFIRMATION_DELIVERY_SECRET;
    if (!expectedSecret || args.deliverySecret !== expectedSecret) throw new Error("Confirmation delivery is not authorized.");
    return claimConfirmationRequest(ctx, args.confirmationToken);
  },
});

// The scheduled Convex action uses an internal claim, so no deployment secret has to be
// passed through or duplicated inside the same trust boundary. The public secret-gated claim
// remains temporarily for older external delivery clients during rollout.
export const claimConfirmationInternal = internalMutation({
  args: { confirmationToken: v.string() },
  handler: (ctx, args) => claimConfirmationRequest(ctx, args.confirmationToken),
});

async function setConfirmationDeliveryStatus(
  ctx: MutationCtx,
  args: { commsLogId?: Id<"comms_log">; status: "sent" | "failed"; error?: string },
) {
  if (args.status === "failed" && !args.error?.trim()) throw new Error("A failed delivery must include the provider error.");
  if (!args.commsLogId) return;
  const log = await ctx.db.get(args.commsLogId);
  if (!log) return;
  await ctx.db.patch(args.commsLogId, {
    status: args.status,
    error: args.status === "failed" ? args.error!.trim() : undefined,
    sentAt: args.status === "sent" ? Date.now() : undefined,
  });
}

// Transitions the comms_log row created at submit time to its final outcome. Gated by the
// same shared secret as claimConfirmation — this is called by an external delivery client,
// never by the browser. If commsLogId is missing (a row created before this field existed),
// this is a no-op rather than an error, so old in-flight confirmations don't start failing.
export const recordConfirmationDelivery = mutation({
  args: {
    commsLogId: v.optional(v.id("comms_log")),
    deliverySecret: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.CONFIRMATION_DELIVERY_SECRET;
    if (!expectedSecret || args.deliverySecret !== expectedSecret) throw new Error("Confirmation delivery is not authorized.");
    await setConfirmationDeliveryStatus(ctx, args);
  },
});

export const recordConfirmationDeliveryInternal = internalMutation({
  args: {
    commsLogId: v.optional(v.id("comms_log")),
    status: v.union(v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: setConfirmationDeliveryStatus,
});
