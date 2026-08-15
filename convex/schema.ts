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

const agentRunStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("needs_input"),
  v.literal("needs_approval"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled"),
);

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
  // Onboarding-captured personalization (name, solo/team, referral source) for ANY signed-in
  // user, not just site owners/admins. Deliberately separate from `organizers` — that table
  // only ever gets a row for the one-time bootstrap owner or someone an owner explicitly adds
  // (see convex/organizers.ts), so nearly every real signup never has an organizers row at
  // all and a field living there would silently never get saved for them. This table is keyed
  // purely on Clerk's identity.subject, with no role/authorization meaning whatsoever.
  userProfiles: defineTable({
    userId: v.string(),
    displayName: v.optional(v.string()),
    signupRole: v.optional(v.union(v.literal("solo"), v.literal("team"))),
    referralSource: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
  event_members: defineTable({
    eventId: v.id("events"),
    userId: v.string(),
    email: v.string(),
    role: v.union(v.literal("organizer"), v.literal("reviewer")),
    invitedByUserId: v.string(),
    // Kept optional for compatibility with memberships created by the earlier
    // invitation flow. Newer writes use createdAt as the canonical timestamp.
    clerkInvitationId: v.optional(v.string()),
    inviteEmailStatus: v.optional(
      v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    ),
    inviteError: v.optional(v.string()),
    invitedAt: v.optional(v.number()),
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
    source: v.union(v.literal("manual"), v.literal("auto"), v.literal("agent")),
    linkedFormId: v.optional(v.id("submission_forms")),
    status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed")),
    dueDate: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_event", ["eventId"]).index("by_speaker", ["speakerId"]).index("by_submission", ["submissionId"]).index("by_sponsor", ["sponsorId"]).index("by_status", ["status"]),
  agent_runs: defineTable({
    eventId: v.id("events"),
    threadId: v.optional(v.string()),
    requestedByUserId: v.string(),
    objective: v.string(),
    status: agentRunStatus,
    model: v.string(),
    // Optional only for preview rows created before provider choice shipped. Every new run
    // writes an explicit snapshot in agentRuns.create.
    providerMode: v.optional(v.union(v.literal("managed"), v.literal("bring_your_own"))),
    idempotencyKey: v.string(),
    stepCount: v.number(),
    maxSteps: v.number(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    finalSummary: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_event_status", ["eventId", "status"])
    .index("by_requester_idempotency", ["requestedByUserId", "idempotencyKey"]),
  // One event-level provider choice. Managed runs use the deployment secret and are metered;
  // BYOK secrets are encrypted server-side and are never projected to browser clients.
  agent_provider_settings: defineTable({
    eventId: v.id("events"),
    mode: v.union(v.literal("managed"), v.literal("bring_your_own")),
    provider: v.literal("openai"),
    credentialHint: v.optional(v.string()),
    credentialEnvelope: v.optional(v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() })),
    status: v.union(v.literal("ready"), v.literal("error")),
    lastError: v.optional(v.string()),
    updatedByUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_event", ["eventId"]),
  // Append-only model usage ledger. Managed rows are the billable source of truth; BYOK rows
  // remain useful for operational cost visibility without being charged by Namos.
  agent_usage_records: defineTable({
    eventId: v.id("events"),
    runId: v.id("agent_runs"),
    providerMode: v.union(v.literal("managed"), v.literal("bring_your_own")),
    provider: v.literal("openai"),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    billable: v.boolean(),
    createdAt: v.number(),
  }).index("by_event", ["eventId"]).index("by_run", ["runId"]),
  agent_run_events: defineTable({
    eventId: v.id("events"),
    runId: v.id("agent_runs"),
    sequence: v.number(),
    type: v.union(
      v.literal("user_message"),
      v.literal("assistant_message"),
      v.literal("progress"),
      v.literal("tool_call"),
      v.literal("tool_result"),
      v.literal("clarification"),
      v.literal("proposal"),
      v.literal("approval"),
      v.literal("error"),
    ),
    message: v.string(),
    toolName: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
    detailsJson: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_run_sequence", ["runId", "sequence"])
    .index("by_event", ["eventId"]),
  agent_action_proposals: defineTable({
    eventId: v.id("events"),
    runId: v.id("agent_runs"),
    kind: v.literal("create_tasks"),
    tasks: v.array(v.object({
      title: v.string(),
      targetType: v.union(v.literal("contact"), v.literal("group"), v.literal("submission"), v.literal("sponsor")),
      speakerId: v.optional(v.id("speakers")),
      submissionId: v.optional(v.id("submissions")),
      sponsorId: v.optional(v.id("sponsors")),
      linkedFormId: v.optional(v.id("submission_forms")),
      dueDate: v.optional(v.number()),
      reason: v.string(),
    })),
    payloadHash: v.string(),
    summary: v.string(),
    status: v.union(v.literal("pending"), v.literal("rejected"), v.literal("applying"), v.literal("applied"), v.literal("failed"), v.literal("superseded")),
    proposedByToolCallId: v.string(),
    decidedByUserId: v.optional(v.string()),
    decisionReason: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    appliedAt: v.optional(v.number()),
    createdTaskIds: v.optional(v.array(v.id("onboarding_tasks"))),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_event_status", ["eventId", "status"]),
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
  embeds: defineTable({
    eventId: v.id("events"), name: v.string(), format: v.literal("styled_html"),
    view: v.union(v.literal("agenda"), v.literal("schedule_itinerary"), v.literal("schedule_grid"), v.literal("session_list"), v.literal("speaker_gallery"), v.literal("speaker_list")),
    enabled: v.boolean(), theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")), primaryColor: v.string(),
    dateFormat: v.union(v.literal("weekday_long"), v.literal("weekday_short"), v.literal("numeric")),
    timeFormat: v.union(v.literal("12_hour"), v.literal("24_hour")), trackIds: v.array(v.id("tracks")),
    fields: v.object({
      agenda: v.object({ title: v.boolean(), time: v.boolean(), room: v.boolean(), track: v.boolean(), speakers: v.boolean() }),
      session: v.object({ title: v.boolean(), time: v.boolean(), room: v.boolean(), track: v.boolean(), speakers: v.boolean() }),
      speaker: v.object({ name: v.boolean(), headshot: v.boolean(), bio: v.boolean(), links: v.boolean(), sessions: v.boolean() }),
    }), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_event", ["eventId"]).index("by_event_enabled", ["eventId", "enabled"]),
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
  // Append-only evidence for every application-level agenda write. A missing delete entry when
  // a row disappears distinguishes an out-of-band dashboard/import operation from app code.
  agenda_items_audit: defineTable({
    eventId: v.id("events"),
    agendaItemId: v.id("agenda_items"),
    operation: v.union(v.literal("create"), v.literal("update"), v.literal("publish"), v.literal("delete")),
    actorUserId: v.string(),
    source: v.string(),
    snapshot: v.any(),
    createdAt: v.number(),
  })
    .index("by_event_createdAt", ["eventId", "createdAt"])
    .index("by_agendaItem_createdAt", ["agendaItemId", "createdAt"]),
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
