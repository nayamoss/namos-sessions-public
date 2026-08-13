import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// One named dimension a reviewer scores a submission on (issue #56). Criteria live on the
// evaluation plan and apply to every one of its rounds. `max` and `weight` only mean anything
// for `number` criteria; a `text` criterion is a free response and never enters the total.
export const evaluationCriterion = v.object({
  id: v.string(),
  label: v.string(),
  type: v.union(v.literal("number"), v.literal("text")),
  max: v.optional(v.number()),
  weight: v.optional(v.number()),
  required: v.boolean(),
});

// One reviewer's answer for one criterion. Keyed by criterion id, never by array position, so
// reordering or deleting a criterion cannot silently reassign a recorded value.
export const evaluationCriterionScore = v.object({
  criterionId: v.string(),
  value: v.optional(v.number()),
  text: v.optional(v.string()),
});

export default defineSchema({
  // Who is allowed to manage events (vs. authenticated-but-not-an-organizer). Role is a
  // database row, never an env var or hardcoded list — see convex/organizers.ts for how rows
  // get here: a one-time "claim owner" bootstrap while this table is empty, then an existing
  // owner explicitly adds anyone else. userId is the Clerk identity.subject.
  organizers: defineTable({
    userId: v.string(),
    email: v.string(),
    role: v.union(v.literal("owner"), v.literal("admin")),
    onboardingCompletedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]).index("by_email", ["email"]),
  event_members: defineTable({
    eventId: v.id("events"),
    userId: v.string(),
    email: v.string(),
    role: v.union(v.literal("organizer"), v.literal("reviewer")),
    invitedByUserId: v.string(),
    createdAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_userId", ["userId"])
    .index("by_email", ["email"])
    .index("by_event_userId", ["eventId", "userId"])
    .index("by_event_email", ["eventId", "email"]),
  events: defineTable({
    name: v.string(), slug: v.string(), type: v.optional(v.string()), websiteUrl: v.optional(v.string()),
    location: v.optional(v.string()), timezone: v.string(), startDate: v.number(), endDate: v.number(),
    description: v.optional(v.string()), contactEmail: v.optional(v.string()), logoFileId: v.optional(v.string()),
    programPublishedAt: v.optional(v.number()),
    theme: v.optional(v.string()), logoStorageKey: v.optional(v.string()), backgroundStorageKey: v.optional(v.string()),
    exhibitorsEnabled: v.boolean(), sponsorsEnabled: v.boolean(), defaultOnboardingTemplateId: v.optional(v.id("task_templates")),
    status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_slug", ["slug"]),
  api_keys: defineTable({
    label: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    createdByUserId: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  }).index("by_keyHash", ["keyHash"]),
  rooms: defineTable({ eventId: v.id("events"), name: v.string(), capacity: v.optional(v.number()), sortOrder: v.number() }).index("by_event", ["eventId"]),
  tracks: defineTable({ eventId: v.id("events"), name: v.string(), color: v.optional(v.string()), sortOrder: v.number() }).index("by_event", ["eventId"]),
  tags: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    color: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_event", ["eventId"]),
  submission_forms: defineTable({
    eventId: v.id("events"), internalName: v.string(), externalTitle: v.string(), pageHeading: v.string(), version: v.number(),
    kind: v.union(v.literal("abstract"), v.literal("session"), v.literal("contact"), v.literal("group"), v.literal("submission_task")), collectParticipants: v.boolean(), welcomeMessage: v.optional(v.string()), showWelcomeMessage: v.boolean(),
    sections: v.array(v.object({ id: v.string(), key: v.union(v.literal("abstract"), v.literal("participant"), v.literal("portal")), title: v.string(), pageHeading: v.string(), description: v.optional(v.string()), fieldIds: v.array(v.string()) })),
    participantRoles: v.array(v.object({ role: v.string(), min: v.optional(v.number()), max: v.optional(v.number()) })),
    crossFieldLimits: v.array(v.object({ id: v.string(), label: v.string(), fieldIds: v.array(v.string()), maxCombinedChars: v.number(), perParticipant: v.boolean() })),
    routingRules: v.optional(v.array(v.object({
      id: v.string(),
      fieldId: v.string(),
      equals: v.string(),
      assignTagIds: v.optional(v.array(v.id("tags"))),
      assignTrackId: v.optional(v.id("tracks")),
      assignSponsorId: v.optional(v.id("sponsors")),
      setStatus: v.optional(v.union(v.literal("pending"), v.literal("accept_queue"), v.literal("accepted"))),
      reviewerUserIds: v.optional(v.array(v.string())),
    }))),
    closeDate: v.optional(v.number()), submissionLimit: v.optional(v.number()), allowMultipleDrafts: v.boolean(), autoRedirectToPortal: v.boolean(), successPageMessage: v.optional(v.string()), reminderEmailEnabled: v.boolean(), adminUserIds: v.array(v.string()), notifyAdminsOnNew: v.array(v.string()), notifyAdminsOnUpdate: v.array(v.string()), sendSubmitterConfirmation: v.boolean(), portalFormSettings: v.optional(v.object({ sendConfirmationEmail: v.boolean(), confirmationBody: v.optional(v.string()) })), status: v.union(v.literal("draft"), v.literal("open"), v.literal("closed")), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_event", ["eventId"]),
  field_definitions: defineTable({ label: v.string(), type: v.union(v.literal("text"), v.literal("wysiwyg"), v.literal("dropdown"), v.literal("multiselect"), v.literal("email"), v.literal("phone"), v.literal("file"), v.literal("date"), v.literal("number")), maxChars: v.optional(v.number()), options: v.optional(v.array(v.string())), locked: v.boolean(), required: v.boolean(), showIf: v.optional(v.object({ fieldId: v.string(), equals: v.string() })), createdAt: v.number(), updatedAt: v.number() }),
  form_responses: defineTable({ eventId: v.id("events"), formId: v.id("submission_forms"), speakerId: v.id("speakers"), submissionId: v.optional(v.id("submissions")), answers: v.record(v.string(), v.string()), createdAt: v.number(), updatedAt: v.number() }).index("by_form_speaker", ["formId", "speakerId"]).index("by_event", ["eventId"]),
  speakers: defineTable({
    eventId: v.id("events"),
    email: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    bio: v.optional(v.string()),
    salutation: v.optional(v.string()),
    honorific: v.optional(v.string()),
    pronouns: v.optional(v.string()),
    gender: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    xUrl: v.optional(v.string()),
    facebookUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    headshotStorageKey: v.optional(v.string()),
    confirmationStatus: v.optional(v.union(v.literal("awaiting"), v.literal("confirmed"), v.literal("declined"))),
    status: v.union(v.literal("invited"), v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_event", ["eventId"]).index("by_event_email", ["eventId", "email"]),
  speaker_documents: defineTable({
    submissionId: v.id("submissions"),
    speakerId: v.id("speakers"),
    kind: v.union(v.literal("slides"), v.literal("supporting_doc")),
    // Despite the plan's legacy field name, this stores a durable Convex storage id.
    // list() resolves it to a fresh URL so expiring provider URLs are never persisted.
    fileUrl: v.string(),
    fileName: v.string(),
    createdAt: v.number(),
  }).index("by_submission", ["submissionId"]).index("by_speaker", ["speakerId"]),
  submissions: defineTable({
    eventId: v.id("events"),
    formId: v.id("submission_forms"),
    idempotencyKey: v.optional(v.string()),
    speakerId: v.optional(v.id("speakers")),
    tagIds: v.optional(v.array(v.id("tags"))),
    trackId: v.optional(v.id("tracks")),
    sponsorId: v.optional(v.id("sponsors")),
    title: v.string(),
    status: v.union(v.literal("draft"), v.literal("pending"), v.literal("accept_queue"), v.literal("accepted"), v.literal("decline_queue"), v.literal("declined"), v.literal("withdrawn")),
    answers: v.any(),
    submittedAt: v.optional(v.number()),
    lastSpeakerEditAt: v.optional(v.number()),
    speakerEditCount: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_event", ["eventId"]).index("by_form", ["formId"]).index("by_form_idempotency", ["formId", "idempotencyKey"]).index("by_speaker", ["speakerId"]),
  evaluations: defineTable({
    eventId: v.id("events"),
    submissionId: v.id("submissions"),
    assignmentId: v.optional(v.id("evaluation_assignments")),
    reviewerName: v.string(),
    score: v.optional(v.number()),
    comments: v.optional(v.string()),
    // Multi-criterion scorecard values (issue #56). Absent on rows recorded before scorecards
    // existed — those keep rendering their single `score`, which the new path never writes.
    criteriaScores: v.optional(v.array(evaluationCriterionScore)),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_event", ["eventId"])
    .index("by_submission", ["submissionId"])
    .index("by_assignment", ["assignmentId"])
    .index("by_submission_reviewer", ["submissionId", "reviewerName"]),
  evaluation_plans: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    rounds: v.number(),
    scoringScaleMax: v.union(v.literal(5), v.literal(10)),
    // The evaluator UI deliberately leaves this as a visible stub. No AI score is generated.
    aiAssistEnabled: v.boolean(),
    // Blind review. Absent or false === today's behaviour. When true, evaluations:myQueue strips
    // speaker identity from every row of every round under this plan before it leaves the server.
    // Optional so every plan written before this shipped stays valid with no migration.
    anonymized: v.optional(v.boolean()),
    // Ordered weighted scoring criteria (issue #56). Optional, so plans created before this
    // existed stay valid and fall back to the single-score reviewer input.
    criteria: v.optional(v.array(evaluationCriterion)),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_event", ["eventId"]),
  evaluation_assignments: defineTable({
    eventId: v.id("events"),
    evaluationPlanId: v.id("evaluation_plans"),
    submissionId: v.id("submissions"),
    reviewerUserId: v.string(),
    round: v.number(),
    createdAt: v.number(),
  }).index("by_event", ["eventId"])
    .index("by_plan", ["evaluationPlanId"])
    .index("by_reviewer", ["reviewerUserId"])
    .index("by_submission", ["submissionId"])
    .index("by_plan_submission_reviewer_round", ["evaluationPlanId", "submissionId", "reviewerUserId", "round"]),
  sponsor_tiers: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    sortOrder: v.number(),
    color: v.optional(v.string()),
    benefitsDescription: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_event", ["eventId"]).index("by_event_sort", ["eventId", "sortOrder"]),
  sponsors: defineTable({
    eventId: v.id("events"),
    tierId: v.optional(v.id("sponsor_tiers")),
    name: v.string(),
    status: v.union(v.literal("prospect"), v.literal("confirmed"), v.literal("declined")),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_event", ["eventId"]).index("by_tier", ["tierId"]),
  sponsor_contacts: defineTable({
    eventId: v.id("events"),
    sponsorId: v.id("sponsors"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.optional(v.string()),
    isPrimary: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_event", ["eventId"]).index("by_sponsor", ["sponsorId"]),
  onboarding_tasks: defineTable({
    eventId: v.id("events"),
    targetType: v.union(v.literal("contact"), v.literal("group"), v.literal("submission"), v.literal("sponsor")),
    submissionId: v.optional(v.id("submissions")),
    speakerId: v.optional(v.id("speakers")),
    sponsorId: v.optional(v.id("sponsors")),
    title: v.string(),
    description: v.optional(v.string()),
    source: v.union(v.literal("manual"), v.literal("auto")),
    linkedFormId: v.optional(v.id("submission_forms")),
    status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed")),
    dueDate: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_event", ["eventId"]).index("by_speaker", ["speakerId"]).index("by_submission", ["submissionId"]).index("by_sponsor", ["sponsorId"]).index("by_status", ["status"]),
  task_templates: defineTable({
    eventId: v.id("events"), name: v.string(), description: v.optional(v.string()),
    items: v.array(v.object({ title: v.string(), description: v.optional(v.string()), targetType: v.union(v.literal("contact"), v.literal("group"), v.literal("submission"), v.literal("sponsor")), linkedFormId: v.optional(v.id("submission_forms")), dueDateOffsetDays: v.optional(v.number()) })),
    isSeeded: v.boolean(), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_event", ["eventId"]),
  speaker_availability: defineTable({
    eventId: v.id("events"),
    speakerId: v.id("speakers"),
    unavailable: v.array(v.object({ date: v.number(), hour: v.optional(v.number()), part: v.optional(v.union(v.literal("morning"), v.literal("afternoon"), v.literal("evening"))) })),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_event", ["eventId"]).index("by_speaker", ["speakerId"]),
  // Conflicts are derived by agenda.detectConflicts rather than stored here. A session can
  // deliberately be unpublished while organizers resolve its room or speaker assignment.
  agenda_items: defineTable({
    eventId: v.id("events"),
    submissionId: v.optional(v.id("submissions")),
    title: v.string(),
    roomId: v.id("rooms"),
    trackId: v.optional(v.id("tracks")),
    startTime: v.number(),
    endTime: v.number(),
    speakerIds: v.array(v.id("speakers")),
    videoUrl: v.optional(v.string()),
    locationDetails: v.optional(v.string()),
    calendarUid: v.optional(v.string()),
    calendarSequence: v.optional(v.number()),
    isPublished: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_room", ["roomId"])
    .index("by_submission", ["submissionId"]),
  comms_templates: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    kind: v.union(
      v.literal("submission_confirmation"),
      v.literal("acceptance"),
      v.literal("rejection"),
      v.literal("consolidated_decision"),
      v.literal("reminder"),
      v.literal("calendar_invite"),
      v.literal("custom"),
    ),
    subject: v.string(),
    body: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_event", ["eventId"]),
  // A communication log is append-only evidence of attempted delivery. In particular, failed
  // confirmation sends are recorded so a provider outage never makes the submission disappear.
  comms_log: defineTable({
    eventId: v.id("events"),
    speakerId: v.optional(v.id("speakers")),
    submissionId: v.optional(v.id("submissions")),
    templateId: v.optional(v.id("comms_templates")),
    channel: v.union(v.literal("email"), v.literal("calendar_invite")),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed")),
    toEmail: v.string(),
    subject: v.string(),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_speaker", ["speakerId"])
    .index("by_submission", ["submissionId"]),
  // Credentials are encrypted by the Convex action runtime before they reach storage. Queries used
  // by the browser never return this document; only the delivery service can resolve it.
  email_integrations: defineTable({
    eventId: v.id("events"),
    provider: v.union(v.literal("resend"), v.literal("ses")),
    authMethod: v.union(v.literal("resend_oauth"), v.literal("resend_api_key"), v.literal("ses_api"), v.literal("ses_smtp")),
    sender: v.string(),
    region: v.optional(v.string()),
    credentialHint: v.string(),
    credentialEnvelope: v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() }),
    status: v.union(v.literal("connected"), v.literal("error")),
    lastError: v.optional(v.string()),
    updatedByUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_event", ["eventId"]),
  // A browser receives only this opaque capability after a public CFP submission. The
  // server-side email handler exchanges it for the linked records, so database ids never
  // have to travel through the public form or its confirmation request.
  submission_confirmation_requests: defineTable({
    token: v.string(),
    eventId: v.id("events"),
    submissionId: v.id("submissions"),
    speakerId: v.id("speakers"),
    createdAt: v.number(),
    consumedAt: v.optional(v.number()),
    // The comms_log row created at submit time, before any delivery attempt. Its
    // existence — not its final status — is what proves a confirmation was ever
    // attempted, even if every later step (secret config, provider config, the
    // send itself) fails. See #46.
    commsLogId: v.optional(v.id("comms_log")),
  }).index("by_token", ["token"]),
});
