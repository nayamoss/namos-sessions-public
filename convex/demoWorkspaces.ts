import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const role = v.union(v.literal("organizer"), v.literal("reviewer"), v.literal("speaker"));
const idleLifetimeMs = 2 * 60 * 60 * 1_000;
const absoluteLifetimeMs = 24 * 60 * 60 * 1_000;

function publicWorkspace(workspace: {
  workspaceId: string;
  eventId: unknown;
  organizerUserId: string;
  reviewerUserId: string;
  speakerUserId: string;
  activeRole: "organizer" | "reviewer" | "speaker";
  expiresAt: number;
  absoluteExpiresAt: number;
}) {
  return {
    workspaceId: workspace.workspaceId,
    eventId: String(workspace.eventId),
    eventSlug: `demo-${workspace.workspaceId}`,
    userIds: {
      organizer: workspace.organizerUserId,
      reviewer: workspace.reviewerUserId,
      speaker: workspace.speakerUserId,
    },
    activeRole: workspace.activeRole,
    expiresAt: workspace.expiresAt,
    absoluteExpiresAt: workspace.absoluteExpiresAt,
  };
}

async function deleteDemoFixture(ctx: MutationCtx, eventId: Id<"events">, organizerUserId: string) {
  const speakers = await ctx.db.query("speakers").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
  const forms = await ctx.db.query("submission_forms").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
  const documents = (await Promise.all(speakers.map((speaker) => ctx.db.query("speaker_documents").withIndex("by_speaker", (q) => q.eq("speakerId", speaker._id)).collect()))).flat();
  for (const document of documents) {
    try { await ctx.storage.delete(document.fileUrl as Id<"_storage">); } catch { /* A legacy/external URL has no Convex storage object. */ }
    await ctx.db.delete(document._id);
  }
  for (const speaker of speakers) {
    if (speaker.headshotStorageKey) {
      try { await ctx.storage.delete(speaker.headshotStorageKey as Id<"_storage">); } catch { /* Same compatibility case as documents. */ }
    }
  }
  const fieldIds = new Set(forms.flatMap((form) => [...(form.sections ?? []), ...(form.pages ?? [])].flatMap((section) => section.fieldIds)));
  const apiTokens = await ctx.db.query("api_tokens").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
  for (const token of apiTokens) {
    const [idempotency, audits, limits] = await Promise.all([
      ctx.db.query("api_idempotency_keys").withIndex("by_token_method_path_key", (q) => q.eq("tokenId", token._id)).collect(),
      ctx.db.query("api_audit_log").withIndex("by_token", (q) => q.eq("tokenId", token._id)).collect(),
      ctx.db.query("api_rate_limits").withIndex("by_token", (q) => q.eq("tokenId", token._id)).collect(),
    ]);
    for (const row of [...idempotency, ...audits, ...limits]) await ctx.db.delete(row._id);
  }
  const tables = [
    "notifications", "form_responses", "evaluations", "ai_assessments", "evaluation_assignments", "evaluation_plans",
    "agenda_items_audit", "agenda_items", "speaker_availability", "onboarding_tasks",
    "agent_action_proposals", "communication_drafts", "agent_run_events", "agent_usage_records", "agent_runs", "agent_provider_settings",
    "comms_log", "comms_templates", "inbound_messages", "inbound_email_domains", "email_integrations",
    "content_oauth_pending", "content_oauth_states", "content_integrations", "submission_confirmation_requests",
    "public_feeds", "embeds", "api_tokens", "sponsor_contacts", "sponsors", "sponsor_tiers",
    "portal_resource_pages", "speaker_notes", "task_templates", "submissions", "speakers", "submission_forms",
    "tags", "tracks", "rooms",
  ] as const;
  for (const table of tables) {
    const index = table === "agenda_items_audit" ? "by_event_createdAt"
      : table === "agent_action_proposals" ? "by_event_status"
        : table === "inbound_messages" ? "by_event_receivedAt"
          : "by_event";
    const rows = await (ctx.db.query(table) as never as { withIndex: (name: string, builder: (q: { eq: (field: string, value: Id<"events">) => unknown }) => unknown) => { collect: () => Promise<Array<{ _id: Id<typeof table> }>> } })
      .withIndex(index, (q) => q.eq("eventId", eventId)).collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
  for (const rawId of fieldIds) {
    const id = ctx.db.normalizeId("field_definitions", rawId);
    if (id) await ctx.db.delete(id);
  }
  const allowances = await ctx.db.query("agent_managed_allowances").withIndex("by_owner_period", (q) => q.eq("billingOwnerUserId", organizerUserId)).collect();
  for (const allowance of allowances) await ctx.db.delete(allowance._id);
}

async function seedDemoFixture(ctx: MutationCtx, input: {
  eventId: Id<"events">;
  reviewerUserId: string;
  speakerEmail: string;
  now: number;
}) {
  const { eventId, reviewerUserId, speakerEmail, now } = input;
  const titleFieldId = await ctx.db.insert("field_definitions", { label: "Session title", type: "text", maxChars: 160, locked: false, required: true, createdAt: now, updatedAt: now });
  const formatFieldId = await ctx.db.insert("field_definitions", { label: "Session format", type: "dropdown", options: ["Talk", "Workshop"], locked: false, required: true, createdAt: now, updatedAt: now });
  const workshopFieldId = await ctx.db.insert("field_definitions", { label: "Workshop materials", type: "wysiwyg", maxChars: 1_000, locked: false, required: true, showIf: { fieldId: String(formatFieldId), equals: "Workshop" }, createdAt: now, updatedAt: now });
  const abstractFieldId = await ctx.db.insert("field_definitions", { label: "Abstract", type: "wysiwyg", maxChars: 2_000, locked: false, required: true, createdAt: now, updatedAt: now });
  const fieldIds = [String(titleFieldId), String(formatFieldId), String(workshopFieldId), String(abstractFieldId)];
  const formId = await ctx.db.insert("submission_forms", {
    eventId,
    internalName: "Judge walkthrough CFP",
    externalTitle: "Namos Sessions CFP",
    pageHeading: "Share your session idea",
    version: 1,
    kind: "session",
    collectParticipants: false,
    welcomeMessage: "Submit a practical session for the program committee.",
    showWelcomeMessage: true,
    sections: [{ id: "demo-abstract", key: "abstract", title: "Session", pageHeading: "Your session", fieldIds }],
    pages: [{ id: "demo-account", kind: "system", systemRole: "account", label: "Contact", pageHeading: "Your details", fieldIds: [] }, { id: "demo-session", kind: "custom", label: "Session", pageHeading: "Your session", fieldIds }, { id: "demo-review", kind: "system", systemRole: "review", label: "Review", pageHeading: "Review and submit", fieldIds: [] }],
    participantRoles: [],
    crossFieldLimits: [{ id: "demo-copy-limit", label: "Proposal copy", fieldIds: [String(workshopFieldId), String(abstractFieldId)], maxCombinedChars: 2_500, perParticipant: false }],
    routingRules: [
      { id: "demo-review-talk", fieldId: String(formatFieldId), equals: "Talk", reviewerUserIds: [reviewerUserId] },
      { id: "demo-review-workshop", fieldId: String(formatFieldId), equals: "Workshop", reviewerUserIds: [reviewerUserId] },
    ],
    closeDate: now + 7 * 24 * 60 * 60 * 1_000,
    allowMultipleDrafts: true,
    autoRedirectToPortal: true,
    reminderEmailEnabled: true,
    adminUserIds: [],
    notifyAdminsOnNew: [],
    notifyAdminsOnUpdate: [],
    sendSubmitterConfirmation: false,
    status: "open",
    createdAt: now,
    updatedAt: now,
  });
  const speakerId = await ctx.db.insert("speakers", {
    eventId,
    email: speakerEmail,
    firstName: "Jordan",
    lastName: "Demo",
    bio: "A seeded speaker completing the judge walkthrough.",
    confirmationStatus: "awaiting",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const taskTemplateId = await ctx.db.insert("task_templates", {
    eventId,
    name: "Demo speaker onboarding",
    description: "Tasks created when the walkthrough submission is accepted.",
    items: [
      { title: "Upload final slides", targetType: "submission", dueDateOffsetDays: 3 },
      { title: "Confirm session details", targetType: "submission", dueDateOffsetDays: 5 },
    ],
    isSeeded: true,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(eventId, { defaultOnboardingTemplateId: taskTemplateId, updatedAt: now });
  const answers = { email: speakerEmail, fieldValues: { [String(titleFieldId)]: "Designing humane AI operations", [String(formatFieldId)]: "Workshop", [String(workshopFieldId)]: "Participants need a laptop.", [String(abstractFieldId)]: "A practical session about accountable operations." }, fieldLabels: {}, participantFieldLabels: {}, participantValues: [] };
  const pendingId = await ctx.db.insert("submissions", { eventId, formId, speakerId, title: "Designing humane AI operations", status: "pending", answers, sourceRef: "demo:seed:pending", submittedAt: now, createdAt: now, updatedAt: now });
  const unscheduledId = await ctx.db.insert("submissions", { eventId, formId, speakerId, title: "Reliable agents in production", status: "accepted", answers, sourceRef: "demo:seed:unscheduled", submittedAt: now, createdAt: now, updatedAt: now });
  const conflictAId = await ctx.db.insert("submissions", { eventId, formId, speakerId, title: "Opening program briefing", status: "accepted", answers, sourceRef: "demo:seed:conflict-a", submittedAt: now, createdAt: now, updatedAt: now });
  const conflictBId = await ctx.db.insert("submissions", { eventId, formId, speakerId, title: "Operations clinic", status: "accepted", answers, sourceRef: "demo:seed:conflict-b", submittedAt: now, createdAt: now, updatedAt: now });
  const planId = await ctx.db.insert("evaluation_plans", { eventId, name: "Program committee review", rounds: 1, scoringScaleMax: 5, aiAssistEnabled: false, criteria: [{ id: "relevance", label: "Program relevance", type: "number", max: 5, weight: 1, required: true }, { id: "notes", label: "Reviewer notes", type: "text", required: true }], createdAt: now, updatedAt: now });
  await ctx.db.insert("evaluation_assignments", { eventId, evaluationPlanId: planId, submissionId: pendingId, reviewerUserId, round: 1, createdAt: now });
  await ctx.db.insert("onboarding_tasks", { eventId, targetType: "submission", submissionId: unscheduledId, speakerId, title: "Upload final slides", description: "Add the deck used for your accepted session.", source: "auto", status: "pending", dueDate: now - 24 * 60 * 60 * 1_000, createdAt: now, updatedAt: now });
  await ctx.db.insert("onboarding_tasks", { eventId, targetType: "submission", submissionId: unscheduledId, speakerId, title: "Confirm session details", source: "manual", status: "pending", dueDate: now + 3 * 24 * 60 * 60 * 1_000, createdAt: now, updatedAt: now });
  const roomId = await ctx.db.insert("rooms", { eventId, name: "Main Hall", capacity: 320, sortOrder: 0 });
  const trackId = await ctx.db.insert("tracks", { eventId, name: "AI Operations", color: "#E56B5D", sortOrder: 0 });
  const startTime = now + 14 * 24 * 60 * 60 * 1_000 + 9 * 60 * 60 * 1_000;
  await ctx.db.insert("agenda_items", { eventId, submissionId: conflictAId, title: "Opening program briefing", roomId, trackId, startTime, endTime: startTime + 60 * 60 * 1_000, speakerIds: [speakerId], isPublished: false, createdAt: now, updatedAt: now });
  await ctx.db.insert("agenda_items", { eventId, submissionId: conflictBId, title: "Operations clinic", roomId, trackId, startTime: startTime + 30 * 60 * 1_000, endTime: startTime + 90 * 60 * 1_000, speakerIds: [speakerId], isPublished: false, createdAt: now, updatedAt: now });
  await ctx.db.insert("comms_templates", { eventId, name: "Reviewed acceptance", kind: "acceptance", subject: "You’re accepted to {{eventName}}", body: "Hi {{speakerName}}, your session {{sessionTitle}} is accepted.", createdAt: now, updatedAt: now });
  const embedFields = { agenda: { title: true, time: true, room: true, track: true, speakers: true }, session: { title: true, time: true, room: true, track: true, speakers: true }, speaker: { name: true, headshot: true, bio: true, links: true, sessions: true } };
  await ctx.db.insert("embeds", { eventId, name: "Speaker gallery", format: "styled_html", view: "speaker_gallery", enabled: false, theme: "system", primaryColor: "#E56B5D", dateFormat: "weekday_long", timeFormat: "12_hour", trackIds: [], fields: embedFields, createdAt: now, updatedAt: now });
  await ctx.db.insert("portal_resource_pages", { eventId, title: "Speaker handbook", slug: "speaker-handbook", bodyHtml: "<h2>Arrival and venue</h2><p>Check in at the registration desk 45 minutes before your session.</p><h2>Speaker support</h2><p>Visit the green room or contact the event team from your portal if you need help.</p>", status: "published", sortOrder: 0, createdAt: now, updatedAt: now });
}

export const provision = internalMutation({
  args: {
    workspaceId: v.string(),
    organizerUserId: v.string(),
    reviewerUserId: v.string(),
    speakerUserId: v.string(),
    organizerEmail: v.string(),
    reviewerEmail: v.string(),
    speakerEmail: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db.query("demo_workspaces").withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId)).unique();
    if (duplicate) return publicWorkspace(duplicate);
    const active = await ctx.db.query("demo_workspaces").withIndex("by_expiresAt", (q) => q.gt("expiresAt", args.now)).take(100);
    if (active.length >= 100) throw new Error("Demo capacity reached.");

    const organizationId = await ctx.db.insert("organizations", {
      name: "Namos Judge Demo",
      createdByUserId: args.organizerUserId,
      createdAt: args.now,
    });
    const eventId = await ctx.db.insert("events", {
      organizationId,
      name: "Namos Program Control Room Demo",
      slug: `demo-${args.workspaceId}`,
      timezone: "America/New_York",
      startDate: args.now + 14 * 24 * 60 * 60 * 1_000,
      endDate: args.now + 16 * 24 * 60 * 60 * 1_000,
      description: "An isolated, resettable event for the five-minute Namos walkthrough.",
      contactEmail: args.organizerEmail,
      exhibitorsEnabled: false,
      sponsorsEnabled: false,
      billingOwnerUserId: args.organizerUserId,
      status: "published",
      createdAt: args.now,
      updatedAt: args.now,
    });
    await ctx.db.insert("organizers", {
      organizationId,
      userId: args.organizerUserId,
      email: args.organizerEmail,
      role: "owner",
      onboardingCompletedAt: args.now,
      createdAt: args.now,
    });
    await ctx.db.insert("event_members", {
      eventId,
      userId: args.reviewerUserId,
      email: args.reviewerEmail,
      role: "reviewer",
      invitedByUserId: args.organizerUserId,
      inviteEmailStatus: "sent",
      invitedAt: args.now,
      createdAt: args.now,
    });
    await seedDemoFixture(ctx, { eventId, reviewerUserId: args.reviewerUserId, speakerEmail: args.speakerEmail, now: args.now });
    const absoluteExpiresAt = args.now + absoluteLifetimeMs;
    const expiresAt = Math.min(args.now + idleLifetimeMs, absoluteExpiresAt);
    const id = await ctx.db.insert("demo_workspaces", {
      workspaceId: args.workspaceId,
      organizationId,
      eventId,
      organizerUserId: args.organizerUserId,
      reviewerUserId: args.reviewerUserId,
      speakerUserId: args.speakerUserId,
      organizerEmail: args.organizerEmail,
      reviewerEmail: args.reviewerEmail,
      speakerEmail: args.speakerEmail,
      activeRole: "organizer",
      createdAt: args.now,
      lastActiveAt: args.now,
      expiresAt,
      absoluteExpiresAt,
    });
    const workspace = await ctx.db.get(id);
    if (!workspace) throw new Error("Demo workspace provisioning failed.");
    return publicWorkspace(workspace);
  },
});

export const get = internalQuery({
  args: { workspaceId: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.query("demo_workspaces").withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId)).unique();
    if (!workspace || workspace.expiresAt <= args.now || workspace.absoluteExpiresAt <= args.now) return null;
    return publicWorkspace(workspace);
  },
});

export const getByEvent = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.query("demo_workspaces").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).first();
    return workspace ? { workspaceId: workspace.workspaceId } : null;
  },
});

export const switchRole = internalMutation({
  args: { workspaceId: v.string(), activeRole: role, now: v.number() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.query("demo_workspaces").withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId)).unique();
    if (!workspace || workspace.expiresAt <= args.now || workspace.absoluteExpiresAt <= args.now) return null;
    const expiresAt = Math.min(args.now + idleLifetimeMs, workspace.absoluteExpiresAt);
    await ctx.db.patch(workspace._id, { activeRole: args.activeRole, lastActiveAt: args.now, expiresAt });
    return { ...publicWorkspace(workspace), activeRole: args.activeRole, expiresAt };
  },
});

export const listDeliveries = internalQuery({
  args: { workspaceId: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.query("demo_workspaces").withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId)).unique();
    if (!workspace || workspace.expiresAt <= args.now || workspace.absoluteExpiresAt <= args.now) return null;
    const rows = await ctx.db.query("demo_deliveries").withIndex("by_workspace_createdAt", (q) => q.eq("workspaceId", args.workspaceId)).order("desc").take(100);
    return rows.map((row) => ({
      id: String(row._id),
      toEmail: row.toEmail,
      subject: row.subject,
      bodyHtml: row.bodyHtml,
      attachmentName: row.attachmentName,
      attachmentContent: row.attachmentContent,
      createdAt: row.createdAt,
    }));
  },
});

export const captureDelivery = internalMutation({
  args: {
    workspaceId: v.string(),
    toEmail: v.string(),
    subject: v.string(),
    bodyHtml: v.string(),
    attachmentName: v.optional(v.string()),
    attachmentContent: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.query("demo_workspaces").withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId)).unique();
    if (!workspace || workspace.expiresAt <= args.now || workspace.absoluteExpiresAt <= args.now) throw new Error("Demo workspace expired.");
    const id = await ctx.db.insert("demo_deliveries", {
      workspaceId: args.workspaceId,
      eventId: workspace.eventId,
      toEmail: args.toEmail,
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      attachmentName: args.attachmentName,
      attachmentContent: args.attachmentContent,
      createdAt: args.now,
    });
    return { id: String(id) };
  },
});

export const captureDeliveryForEvent = internalMutation({
  args: {
    eventId: v.id("events"),
    toEmail: v.string(),
    subject: v.string(),
    bodyHtml: v.string(),
    attachmentName: v.optional(v.string()),
    attachmentContent: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.query("demo_workspaces").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).first();
    if (!workspace) throw new Error("Event is not a demo workspace.");
    const id = await ctx.db.insert("demo_deliveries", {
      workspaceId: workspace.workspaceId,
      eventId: args.eventId,
      toEmail: args.toEmail,
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      attachmentName: args.attachmentName,
      attachmentContent: args.attachmentContent,
      createdAt: args.now,
    });
    return { id: String(id) };
  },
});

export const reset = internalMutation({
  args: { workspaceId: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.query("demo_workspaces").withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId)).unique();
    if (!workspace || workspace.expiresAt <= args.now || workspace.absoluteExpiresAt <= args.now) return null;
    const deliveries = await ctx.db.query("demo_deliveries").withIndex("by_workspace_createdAt", (q) => q.eq("workspaceId", args.workspaceId)).collect();
    await Promise.all(deliveries.map((row) => ctx.db.delete(row._id)));
    await deleteDemoFixture(ctx, workspace.eventId, workspace.organizerUserId);
    await seedDemoFixture(ctx, { eventId: workspace.eventId, reviewerUserId: workspace.reviewerUserId, speakerEmail: workspace.speakerEmail, now: args.now });
    const expiresAt = Math.min(args.now + idleLifetimeMs, workspace.absoluteExpiresAt);
    await ctx.db.patch(workspace.eventId, { status: "published", programPublishedAt: undefined, billingOwnerUserId: workspace.organizerUserId, updatedAt: args.now });
    await ctx.db.patch(workspace._id, { activeRole: "organizer", lastActiveAt: args.now, expiresAt });
    return { ...publicWorkspace(workspace), activeRole: "organizer" as const, expiresAt };
  },
});

export const cleanupExpired = internalMutation({
  args: { now: v.number(), limit: v.number() },
  handler: async (ctx, args) => {
    const expired = await ctx.db.query("demo_workspaces").withIndex("by_expiresAt", (q) => q.lte("expiresAt", args.now)).take(Math.min(Math.max(args.limit, 1), 100));
    const clerkUserIds: string[] = [];
    for (const workspace of expired) {
      const deliveries = await ctx.db.query("demo_deliveries").withIndex("by_workspace_createdAt", (q) => q.eq("workspaceId", workspace.workspaceId)).collect();
      const members = await ctx.db.query("event_members").withIndex("by_event", (q) => q.eq("eventId", workspace.eventId)).collect();
      await deleteDemoFixture(ctx, workspace.eventId, workspace.organizerUserId);
      await Promise.all([...deliveries, ...members].map((row) => ctx.db.delete(row._id)));
      await ctx.db.delete(workspace.eventId);
      for (const userId of [workspace.organizerUserId, workspace.reviewerUserId, workspace.speakerUserId]) {
        const [profiles, devices] = await Promise.all([
          ctx.db.query("userProfiles").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
          ctx.db.query("device_tokens").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
        ]);
        for (const row of [...profiles, ...devices]) await ctx.db.delete(row._id);
      }
      const organizers = await ctx.db.query("organizers").withIndex("by_organization", (q) => q.eq("organizationId", workspace.organizationId)).collect();
      await Promise.all(organizers.map((row) => ctx.db.delete(row._id)));
      await ctx.db.delete(workspace.organizationId);
      await ctx.db.delete(workspace._id);
      clerkUserIds.push(workspace.organizerUserId, workspace.reviewerUserId, workspace.speakerUserId);
    }
    return { removed: expired.length, clerkUserIds };
  },
});
