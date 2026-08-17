import { internalMutation } from "./_generated/server";
import { recordAgendaItemAudit } from "./agendaAudit";

const eventSlug = "ai-engineer-sandbox-event";
const seededAt = Date.UTC(2026, 8, 1, 12, 0);

// Re-runnable demo fixture. It fills in missing fixture records without duplicating a
// previously seeded event. This is intentionally internal-only; operators can run it from
// an authenticated Convex CLI with: npm run seed:demo
export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let event = await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", eventSlug)).first();
    const eventWasMissing = !event;
    if (!event) {
      const eventId = await ctx.db.insert("events", { name: "AI.Engineer Sandbox Event — NYC", slug: eventSlug, type: "conference", location: "New York, NY", timezone: "America/New_York", startDate: Date.UTC(2026, 8, 15), endDate: Date.UTC(2026, 8, 17), description: "The conference for builders shipping production AI systems.", contactEmail: "program@ai.engineer", logoFileId: "ai-engineer-mark", programPublishedAt: seededAt, exhibitorsEnabled: false, sponsorsEnabled: true, status: "published", createdAt: seededAt, updatedAt: now });
      event = await ctx.db.get(eventId);
    } else if (event.status !== "published" || !event.sponsorsEnabled) {
      await ctx.db.patch(event._id, { status: "published", sponsorsEnabled: true, updatedAt: now });
      event = { ...event, status: "published", sponsorsEnabled: true };
    }
    if (!event) throw new Error("Could not create the demo event.");
    const eventId = event._id;

    const representativeEvents = [
      { name: "Namos Sessions Draft", slug: "namos-sessions-draft", status: "draft" as const, startDate: Date.UTC(2027, 0, 10), endDate: Date.UTC(2027, 0, 11) },
      { name: "Namos Sessions Archive", slug: "namos-sessions-archive", status: "archived" as const, startDate: Date.UTC(2025, 0, 10), endDate: Date.UTC(2025, 0, 11) },
    ];
    for (const fixture of representativeEvents) {
      const existing = await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", fixture.slug)).first();
      if (!existing) {
        await ctx.db.insert("events", { ...fixture, type: "conference", timezone: "America/New_York", description: `${fixture.name} API fixture.`, exhibitorsEnabled: false, sponsorsEnabled: false, createdAt: seededAt, updatedAt: now });
      }
    }

    const rooms = await ctx.db.query("rooms").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    const roomIds = await Promise.all(["Grand Hall", "Studio 1", "Studio 2", "Workshop Room"].map(async (name, sortOrder) => {
      const existing = rooms.find((room) => room.name === name);
      if (existing) return existing._id;
      return ctx.db.insert("rooms", { eventId, name, sortOrder });
    }));
    const tracks = await ctx.db.query("tracks").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    const trackIds = await Promise.all(["Engineering", "Product", "Operations", "Keynote"].map(async (name, sortOrder) => {
      const existing = tracks.find((track) => track.name === name);
      if (existing) return existing._id;
      return ctx.db.insert("tracks", { eventId, name, sortOrder });
    }));

    const existingTiers = await ctx.db.query("sponsor_tiers").withIndex("by_event", q => q.eq("eventId", eventId)).collect();
    const tierIds = await Promise.all([["Platinum", "#525252"], ["Gold", "#a16207"], ["Community", "#64748b"]].map(async ([name, color], sortOrder) => existingTiers.find(tier => tier.name === name)?._id ?? ctx.db.insert("sponsor_tiers", { eventId, name, color, sortOrder, benefitsDescription: `${name} event partnership.`, createdAt: seededAt, updatedAt: now })));
    const existingSponsors = await ctx.db.query("sponsors").withIndex("by_event", q => q.eq("eventId", eventId)).collect();
    const sponsorFixtures = [["Convex", tierIds[0], "confirmed"], ["Resend", tierIds[1], "confirmed"], ["Open Source Collective", tierIds[2], "prospect"]] as const;
    const sponsorIds = await Promise.all(sponsorFixtures.map(async ([name, tierId, status]) => existingSponsors.find(sponsor => sponsor.name === name)?._id ?? ctx.db.insert("sponsors", { eventId, name, tierId, status, website: `https://${name.toLowerCase().replace(/ /g, "-")}.example`, notes: "Seeded sponsor for the demo workflow.", createdAt: seededAt, updatedAt: now })));
    const existingContacts = await ctx.db.query("sponsor_contacts").withIndex("by_event", q => q.eq("eventId", eventId)).collect();
    await Promise.all(sponsorIds.map((sponsorId, index) => existingContacts.some(contact => contact.sponsorId === sponsorId) ? undefined : ctx.db.insert("sponsor_contacts", { eventId, sponsorId, name: ["Maya Chen", "Theo Brooks", "Sam Rivera"][index], email: `sponsor-${index + 1}@seed.invalid`, role: index === 0 ? "Partnerships" : "Event marketing", isPrimary: true, createdAt: seededAt, updatedAt: now })));

    const existingFields = await ctx.db.query("field_definitions").collect();
    const ensureField = async (label: string, type: "text" | "wysiwyg" | "dropdown" | "email", required: boolean, extra: { maxChars?: number; options?: string[] } = {}) => {
      const existing = existingFields.find((field) => field.label === label);
      if (existing) return existing._id;
      const id = await ctx.db.insert("field_definitions", { label, type, required, locked: label === "Session title" || label === "Speaker email", ...extra, createdAt: seededAt, updatedAt: now });
      const field = await ctx.db.get(id);
      if (!field) throw new Error(`Could not create the ${label} field.`);
      existingFields.push(field);
      return id;
    };
    const titleField = await ensureField("Session title", "text", true, { maxChars: 100 });
    const formatField = await ensureField("Session format", "dropdown", true, { options: ["Talk", "Workshop", "Panel"] });
    const abstractField = await ensureField("Abstract", "wysiwyg", true, { maxChars: 1_500 });
    const audienceField = await ensureField("Audience", "text", true, { maxChars: 500 });
    const participantNameField = await ensureField("Participant name", "text", true);
    const participantEmailField = await ensureField("Participant email", "email", true);
    const portalSlidesField = await ensureField("Slides URL", "text", false, { maxChars: 500 });

    const forms = await ctx.db.query("submission_forms").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    const cfpPatch = {
      externalTitle: "Speak at AI.Engineer", pageHeading: "Submit", version: 1, kind: "abstract" as const, collectParticipants: true,
      showWelcomeMessage: true, welcomeMessage: "Share your best practical AI session idea.",
      sections: [
        { id: "seed-abstract", key: "abstract" as const, title: "Proposal", pageHeading: "Your proposal", description: "Tell us what attendees will learn.", fieldIds: [String(titleField), String(formatField), String(abstractField), String(audienceField)] },
        { id: "seed-participant", key: "participant" as const, title: "Speaker", pageHeading: "Speaker details", description: "Tell us who will present.", fieldIds: [String(participantNameField), String(participantEmailField)] },
      ],
      participantRoles: [{ role: "Primary speaker", min: 1, max: 1 }],
      crossFieldLimits: [{ id: "seed-program-copy", label: "Program copy", fieldIds: [String(titleField), String(abstractField), String(audienceField)], maxCombinedChars: 2_000, perParticipant: false }],
      routingRules: [{ id: "seed-sponsor-fast-track", fieldId: String(formatField), equals: "Workshop", assignSponsorId: sponsorIds[0], setStatus: "accept_queue" as const }],
      closeDate: Date.UTC(2026, 8, 14, 23, 59), allowMultipleDrafts: true, autoRedirectToPortal: true, reminderEmailEnabled: true, adminUserIds: [], notifyAdminsOnNew: [], notifyAdminsOnUpdate: [], sendSubmitterConfirmation: true, status: "open" as const, updatedAt: now,
    };
    let cfpForm = forms.find((form) => form.internalName === "AI.Engineer CFP");
    if (cfpForm) { await ctx.db.patch(cfpForm._id, cfpPatch); cfpForm = { ...cfpForm, ...cfpPatch }; }
    else { const id = await ctx.db.insert("submission_forms", { eventId, internalName: "AI.Engineer CFP", ...cfpPatch, createdAt: seededAt }); cfpForm = await ctx.db.get(id); }
    if (!cfpForm) throw new Error("Could not create the demo CFP form.");

    const closedPatch = { ...cfpPatch, externalTitle: "Closed CFP demo", pageHeading: "Closed submissions", status: "closed" as const, closeDate: Date.UTC(2026, 7, 1, 23, 59), updatedAt: now };
    let closedForm = forms.find((form) => form.internalName === "Closed CFP demo");
    if (closedForm) { await ctx.db.patch(closedForm._id, closedPatch); closedForm = { ...closedForm, ...closedPatch }; }
    else { const id = await ctx.db.insert("submission_forms", { eventId, internalName: "Closed CFP demo", ...closedPatch, createdAt: seededAt }); closedForm = await ctx.db.get(id); }
    if (!closedForm) throw new Error("Could not create the closed demo CFP form.");

    const portalPatch = {
      externalTitle: "Speaker readiness checklist", pageHeading: "Speaker readiness", version: 1, kind: "submission_task" as const, collectParticipants: false,
      showWelcomeMessage: false, sections: [{ id: "seed-portal", key: "portal" as const, title: "Slides", pageHeading: "Slides", description: "Share the link to your final slides.", fieldIds: [String(portalSlidesField)] }], participantRoles: [], crossFieldLimits: [], allowMultipleDrafts: true, autoRedirectToPortal: false, reminderEmailEnabled: false, adminUserIds: [], notifyAdminsOnNew: [], notifyAdminsOnUpdate: [], sendSubmitterConfirmation: false, portalFormSettings: { sendConfirmationEmail: false }, status: "open" as const, updatedAt: now,
    };
    let portalForm = forms.find((form) => form.internalName === "Speaker readiness checklist");
    if (portalForm) { await ctx.db.patch(portalForm._id, portalPatch); portalForm = { ...portalForm, ...portalPatch }; }
    else { const id = await ctx.db.insert("submission_forms", { eventId, internalName: "Speaker readiness checklist", ...portalPatch, createdAt: seededAt }); portalForm = await ctx.db.get(id); }
    if (!portalForm) throw new Error("Could not create the demo portal form.");

    const existingTemplates = await ctx.db.query("task_templates").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    const starterTemplates = [["Standard Speaker Onboarding", ["Upload headshot", "Confirm bio", "Upload slides", "Sign speaker agreement"]], ["Keynote Speaker", ["Confirm keynote title", "Upload headshot", "Share AV requirements", "Upload slides"]], ["Workshop Facilitator", ["Confirm workshop materials", "Share room setup", "Upload slides", "Sign speaker agreement"]], ["Panelist", ["Confirm panel topic", "Confirm bio", "Share discussion prompts"]], ["Virtual/Remote Speaker", ["Run technical check", "Confirm time zone", "Upload slides", "Share backup connection"]], ["Sponsor-Nominated Speaker", ["Confirm sponsor details", "Confirm bio", "Upload headshot", "Sign speaker agreement"]]] as const;
    await Promise.all(starterTemplates.map(async ([name, titles]) => { if (!existingTemplates.some((template) => template.name === name)) await ctx.db.insert("task_templates", { eventId, name, items: titles.map((title) => ({ title, targetType: "submission" as const })), isSeeded: true, createdAt: seededAt, updatedAt: now }); }));
    const existingSponsorTasks = await ctx.db.query("onboarding_tasks").withIndex("by_sponsor", q => q.eq("sponsorId", sponsorIds[0])).collect();
    await Promise.all(["Contract signed", "Logo received", "Booth confirmed"].map((title, index) => existingSponsorTasks.some(task => task.title === title) ? undefined : ctx.db.insert("onboarding_tasks", { eventId, sponsorId: sponsorIds[0], targetType: "sponsor", title, source: "manual", status: index === 0 ? "completed" : "pending", completedAt: index === 0 ? seededAt : undefined, dueDate: Date.UTC(2026, 8, 5 + index), createdAt: seededAt, updatedAt: now })));

    const currentSpeakers = await ctx.db.query("speakers").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    const speakers = await Promise.all(Array.from({ length: 60 }, async (_, index) => {
      const email = `speaker-${index + 1}@seed.invalid`;
      const existing = currentSpeakers.find((speaker) => speaker.email === email);
      const confirmationStatus = index % 4 === 0 ? "confirmed" as const : index % 4 === 1 ? "declined" as const : "awaiting" as const;
      if (existing) {
        // Previous seeds stored a non-Convex placeholder path. Never present it as a public
        // storage asset; a real image is set only by the scoped headshot upload flow.
        await ctx.db.patch(existing._id, { confirmationStatus, ...(existing.headshotStorageKey?.startsWith("seed/") ? { headshotStorageKey: undefined } : {}), updatedAt: now });
        return existing._id;
      }
      return ctx.db.insert("speakers", { eventId, email, firstName: "Speaker", lastName: String(index + 1), bio: index % 5 === 0 ? undefined : `Demo speaker ${index + 1} with a practical perspective on AI.`, confirmationStatus, status: "active", createdAt: seededAt, updatedAt: now });
    }));

    const statuses = ["accepted", "pending", "accept_queue", "maybe", "decline_queue", "declined", "withdrawn", "draft"] as const;
    const currentSubmissions = await ctx.db.query("submissions").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    const submissionIds = await Promise.all(Array.from({ length: 500 }, async (_, index) => {
      const title = `Demo session ${index + 1}: practical AI`;
      const existing = currentSubmissions.find((submission) => submission.title === title);
      const email = `speaker-${index % speakers.length + 1}@seed.invalid`;
      const fieldValues = { [String(titleField)]: title, [String(formatField)]: "Talk", [String(abstractField)]: `A seeded abstract for session ${index + 1}.`, [String(audienceField)]: "AI engineering practitioners" };
      const answers = { email, fieldValues, fieldLabels: { [String(titleField)]: "Session title", [String(formatField)]: "Session format", [String(abstractField)]: "Abstract", [String(audienceField)]: "Audience" }, participantFieldLabels: {}, participantValues: [] };
      if (existing) {
        if (!(existing.answers && typeof existing.answers === "object" && "fieldValues" in existing.answers)) await ctx.db.patch(existing._id, { answers, updatedAt: now });
        return existing._id;
      }
      return ctx.db.insert("submissions", { eventId, formId: cfpForm!._id, speakerId: speakers[index % speakers.length], title, status: statuses[index % statuses.length], answers, submittedAt: seededAt, createdAt: seededAt, updatedAt: now });
    }));
    let closedSubmission = currentSubmissions.find((submission) => submission.title === "Closed-form demo proposal");
    if (!closedSubmission) {
      const id = await ctx.db.insert("submissions", { eventId, formId: closedForm._id, speakerId: speakers[0], title: "Closed-form demo proposal", status: "pending", answers: { email: "speaker-1@seed.invalid", fieldValues: { [String(titleField)]: "Closed-form demo proposal", [String(formatField)]: "Talk", [String(abstractField)]: "A proposal that demonstrates the closed-submissions lock.", [String(audienceField)]: "Program reviewers" }, fieldLabels: { [String(titleField)]: "Session title", [String(formatField)]: "Session format", [String(abstractField)]: "Abstract", [String(audienceField)]: "Audience" }, participantFieldLabels: {}, participantValues: [] }, submittedAt: seededAt, createdAt: seededAt, updatedAt: now });
      closedSubmission = await ctx.db.get(id);
    }

    const currentEvaluations = await ctx.db.query("evaluations").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    await Promise.all(submissionIds.slice(0, 24).map(async (submissionId, index) => {
      const reviewerName = `Reviewer ${index % 6 + 1}`;
      if (currentEvaluations.some((evaluation) => evaluation.submissionId === submissionId && evaluation.reviewerName === reviewerName)) return;
      await ctx.db.insert("evaluations", { eventId, submissionId, reviewerName, score: index % 5 + 1, comments: "Seeded review", createdAt: seededAt, updatedAt: now });
    }));
    // Keep the evaluation surface usable immediately after a re-runnable demo seed. The
    // score rows above remain the denormalized rating source; these assignments make their
    // reviewer/round scope explicit without duplicating the score on subsequent runs.
    const evaluationPlans = await ctx.db.query("evaluation_plans").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    let evaluationPlan = evaluationPlans.find((plan) => plan.name === "Program committee review");
    if (!evaluationPlan) {
      const id = await ctx.db.insert("evaluation_plans", { eventId, name: "Program committee review", rounds: 1, scoringScaleMax: 5, aiAssistEnabled: false, createdAt: seededAt, updatedAt: now });
      evaluationPlan = await ctx.db.get(id);
    }
    if (!evaluationPlan) throw new Error("Could not create the demo evaluation plan.");
    const evaluationAssignments = await ctx.db.query("evaluation_assignments").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    const refreshedEvaluations = await ctx.db.query("evaluations").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    await Promise.all(submissionIds.slice(0, 24).map(async (submissionId, index) => {
      const reviewerUserId = `Reviewer ${index % 6 + 1}`;
      let assignment = evaluationAssignments.find((entry) => entry.evaluationPlanId === evaluationPlan!._id && entry.submissionId === submissionId && entry.reviewerUserId === reviewerUserId && entry.round === 1);
      if (!assignment) {
        const id = await ctx.db.insert("evaluation_assignments", { eventId, evaluationPlanId: evaluationPlan!._id, submissionId, reviewerUserId, round: 1, createdAt: seededAt });
        assignment = await ctx.db.get(id);
      }
      const score = refreshedEvaluations.find((evaluation) => evaluation.submissionId === submissionId && evaluation.reviewerName === reviewerUserId);
      if (assignment && score && score.assignmentId !== assignment._id) await ctx.db.patch(score._id, { assignmentId: assignment._id, updatedAt: now });
    }));

    // Reviewer progress (issue #59) needs reviewers who are *behind*, and reviewers who can
    // actually be emailed — the demo strings above are all complete and none is an address, so
    // the feature would otherwise demo as a table of disabled buttons. These three cover the
    // three states: below the bar and reachable, complete, and behind with no email on file.
    // The addresses are @seed.invalid on purpose: nothing real can ever receive one.
    const reviewerFixtures = [
      { reviewerUserId: "program-chair@seed.invalid", assigned: 8, completed: 2 },
      { reviewerUserId: "review-lead@seed.invalid", assigned: 4, completed: 4 },
      { reviewerUserId: "Reviewer 7", assigned: 3, completed: 1 },
    ];
    const planAssignments = await ctx.db.query("evaluation_assignments").withIndex("by_plan", (q) => q.eq("evaluationPlanId", evaluationPlan!._id)).collect();
    const planEvaluations = await ctx.db.query("evaluations").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    for (const fixture of reviewerFixtures) {
      for (let index = 0; index < fixture.assigned; index += 1) {
        const submissionId = submissionIds[(index + 30) % submissionIds.length];
        let assignment = planAssignments.find((entry) => entry.submissionId === submissionId && entry.reviewerUserId === fixture.reviewerUserId && entry.round === 1);
        if (!assignment) {
          const id = await ctx.db.insert("evaluation_assignments", { eventId, evaluationPlanId: evaluationPlan._id, submissionId, reviewerUserId: fixture.reviewerUserId, round: 1, createdAt: seededAt });
          assignment = await ctx.db.get(id);
        }
        if (!assignment || index >= fixture.completed) continue;
        if (planEvaluations.some((evaluation) => evaluation.assignmentId === assignment!._id)) continue;
        await ctx.db.insert("evaluations", { eventId, submissionId, assignmentId: assignment._id, reviewerName: fixture.reviewerUserId, score: (index % 5) + 1, comments: "Seeded review", createdAt: seededAt, updatedAt: now });
      }
    }

    const currentTasks = await ctx.db.query("onboarding_tasks").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    await Promise.all(speakers.slice(0, 12).map(async (speakerId, index) => {
      const title = index === 0 ? "Submit slides" : index % 2 ? "Upload headshot" : "Confirm session details";
      if (currentTasks.some((task) => task.speakerId === speakerId && task.title === title)) return;
      await ctx.db.insert("onboarding_tasks", { eventId, targetType: "submission", submissionId: submissionIds[index], speakerId, title, source: index % 2 ? "auto" : "manual", status: index % 3 === 0 ? "completed" : "pending", linkedFormId: index === 0 ? portalForm!._id : undefined, dueDate: Date.UTC(2026, 8, 1 + index), completedAt: index % 3 === 0 ? seededAt : undefined, createdAt: seededAt, updatedAt: now });
    }));

    const availability = await ctx.db.query("speaker_availability").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    if (!availability.some((entry) => entry.speakerId === speakers[0])) await ctx.db.insert("speaker_availability", { eventId, speakerId: speakers[0], unavailable: [{ date: Date.UTC(2026, 8, 15), part: "morning" }], notes: "Seeded availability conflict", createdAt: seededAt, updatedAt: now });

    const start = Date.UTC(2026, 8, 15, 14, 0);
    const agenda = await ctx.db.query("agenda_items").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    const agendaFixtures = [
      { title: "Opening keynote", submissionId: submissionIds[0], roomId: roomIds[0], trackId: trackIds[3], startTime: start, endTime: start + 60 * 60_000, speakerIds: [speakers[0]] },
      { title: "Reliable AI agents", submissionId: submissionIds[1], roomId: roomIds[0], trackId: trackIds[0], startTime: start + 30 * 60_000, endTime: start + 90 * 60_000, speakerIds: [speakers[0]] },
      { title: "Engineering systems clinic", submissionId: submissionIds[2], roomId: roomIds[1], trackId: trackIds[0], startTime: start + 45 * 60_000, endTime: start + 105 * 60_000, speakerIds: [speakers[2]] },
    ];
    await Promise.all(agendaFixtures.map(async (item) => {
      if (agenda.some((entry) => entry.title === item.title)) return;
      const agendaItemId = await ctx.db.insert("agenda_items", { eventId, ...item, isPublished: true, createdAt: seededAt, updatedAt: now });
      const created = await ctx.db.get(agendaItemId);
      if (!created) throw new Error("Seeded agenda item disappeared while creating it.");
      await recordAgendaItemAudit(ctx, {
        item: created,
        operation: "create",
        actorUserId: "system:seed",
        source: "seed:demo",
      });
    }));

    const comms = await ctx.db.query("comms_log").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    await Promise.all((["sent", "queued", "failed"] as const).map(async (status, index) => {
      const subject = "Your AI.Engineer submission";
      const toEmail = `speaker-${index + 1}@seed.invalid`;
      if (comms.some((entry) => entry.toEmail === toEmail && entry.subject === subject && entry.status === status)) return;
      await ctx.db.insert("comms_log", { eventId, speakerId: speakers[index], submissionId: submissionIds[index], channel: "email", status, toEmail, subject, sentAt: status === "sent" ? seededAt : undefined, error: status === "failed" ? "Seeded provider failure" : undefined, createdAt: seededAt });
    }));

    const templates = await ctx.db.query("comms_templates").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    if (!templates.some((template) => template.name === "Speaker reminder")) {
      await ctx.db.insert("comms_templates", {
        eventId,
        name: "Speaker reminder",
        kind: "reminder",
        subject: "Your speaker tasks are due",
        body: "Please finish your remaining portal tasks before the deadline.",
        createdAt: seededAt,
        updatedAt: now,
      });
    }

    const embeds = await ctx.db.query("embeds").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    const embedFields = { agenda: { title: true, time: true, room: true, track: true, speakers: true }, session: { title: true, time: true, room: true, track: true, speakers: true }, speaker: { name: true, headshot: true, bio: true, links: true, sessions: true } };
    if (!embeds.some((embed) => embed.name === "Main event agenda")) await ctx.db.insert("embeds", { eventId, name: "Main event agenda", format: "styled_html", view: "agenda", enabled: true, theme: "system", primaryColor: "#E56B5D", dateFormat: "weekday_long", timeFormat: "12_hour", trackIds: [], fields: embedFields, createdAt: seededAt, updatedAt: now });
    if (!embeds.some((embed) => embed.name === "Speaker gallery draft")) await ctx.db.insert("embeds", { eventId, name: "Speaker gallery draft", format: "styled_html", view: "speaker_gallery", enabled: false, theme: "system", primaryColor: "#E56B5D", dateFormat: "weekday_long", timeFormat: "12_hour", trackIds: [], fields: embedFields, createdAt: seededAt, updatedAt: now });

    return { eventId, created: eventWasMissing, speakers: speakers.length, submissions: submissionIds.length, cfpFormId: cfpForm._id, portalFormId: portalForm._id };
  },
});
