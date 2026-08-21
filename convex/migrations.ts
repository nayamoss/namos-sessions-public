import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { assertValidPages, derivePages } from "./formPages";

// One-time migration from the pre-multi-tenancy data model, where a single global `organizers`
// table acted as a deployment-wide ACL and every organizer implicitly owned every event.
//
// Run it immediately after deploying the code, once per deployment:
//
//   npx convex run migrations:backfillOrganizations '{"name":"Namos Sessions"}'
//
// Deploy and backfill are ONE operation, not two. Between them the guards fail closed, so
// existing organizers cannot reach their own events until this has run.
//
// It is deliberately an internalMutation: it can only be invoked from the CLI by someone with
// deploy access, never from the app or an HTTP route.
//
// Nothing is deleted and nothing changes hands. Every current organizer already sees every
// current event, so putting all of them in one organization preserves today's access exactly.
// The boundary only starts to apply to accounts created after this point, which is the intent.
export const backfillOrganizations = internalMutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const alreadyMigrated = await ctx.db.query("organizations").first();
    if (alreadyMigrated)
      throw new Error(
        `Migration has already run — organization "${alreadyMigrated.name}" exists. Refusing to create a second one.`,
      );

    const organizers = await ctx.db.query("organizers").collect();
    const events = await ctx.db.query("events").collect();

    // The legacy owner keeps ownership. Earliest owner row wins; fall back to the earliest row
    // of any role, and finally to a placeholder if the table is empty (fresh deployment).
    const byCreatedAt = [...organizers].sort((a, b) => a.createdAt - b.createdAt);
    const legacyOwner =
      byCreatedAt.find((row) => row.role === "owner") ?? byCreatedAt[0] ?? null;

    const organizationId = await ctx.db.insert("organizations", {
      name: args.name?.trim() || "My organization",
      createdByUserId: legacyOwner?.userId ?? "system:migration",
      createdAt: Date.now(),
    });

    let organizersPatched = 0;
    for (const organizer of organizers) {
      if (organizer.organizationId) continue;
      await ctx.db.patch(organizer._id, { organizationId });
      organizersPatched += 1;
    }

    let eventsPatched = 0;
    for (const event of events) {
      if (event.organizationId) continue;
      await ctx.db.patch(event._id, { organizationId });
      eventsPatched += 1;
    }

    return {
      organizationId,
      organizationName: args.name?.trim() || "My organization",
      legacyOwnerUserId: legacyOwner?.userId ?? null,
      organizersPatched,
      eventsPatched,
    };
  },
});

// Read-only verification, safe to run before and after the migration above.
export const auditTenancy = internalMutation({
  args: {},
  handler: async (ctx) => {
    const [organizations, organizers, events] = await Promise.all([
      ctx.db.query("organizations").collect(),
      ctx.db.query("organizers").collect(),
      ctx.db.query("events").collect(),
    ]);
    return {
      organizations: organizations.length,
      organizers: organizers.length,
      events: events.length,
      organizersMissingOrg: organizers.filter((row) => !row.organizationId).length,
      eventsMissingOrg: events.filter((row) => !row.organizationId).length,
    };
  },
});

// Additive, repeatable migration for #234. It only fills missing pages, so later
// organizer changes always remain authoritative when this is rerun.
export const backfillSubmissionFormPages = internalMutation({
  args: {},
  handler: async (ctx) => {
    const forms = await ctx.db.query("submission_forms").collect();
    let patched = 0;
    for (const form of forms) {
      if (form.pages?.length) continue;
      await ctx.db.patch(form._id, { pages: derivePages(form) });
      patched += 1;
    }
    return { patched, total: forms.length };
  },
});

// Targeted recovery for legacy rows identified by the post-backfill audit. It
// never scans or rewrites valid organizer-owned pages: callers must pass the
// exact audited ids, and each row is repaired from its retained legacy
// sections before validation.
export const repairInvalidSubmissionFormPages = internalMutation({
  args: { formIds: v.array(v.id("submission_forms")) },
  handler: async (ctx, args) => {
    const repaired: string[] = [];
    for (const formId of args.formIds) {
      const form = await ctx.db.get(formId);
      if (!form) continue;
      try {
        assertValidPages(form.pages ?? [], form.kind, form.collectParticipants);
        continue;
      } catch {
        const pages = derivePages({ ...form, pages: undefined });
        assertValidPages(pages, form.kind, form.collectParticipants);
        await ctx.db.patch(formId, { pages });
        repaired.push(String(formId));
      }
    }
    return { repaired };
  },
});

// Read-only audit for the additive #234 rollout. Keep this callable after the
// backfill so production can be checked without changing or deleting legacy sections.
export const auditSubmissionFormPages = internalMutation({
  args: {},
  handler: async (ctx) => {
    const forms = await ctx.db.query("submission_forms").collect();
    const missingPageFormIds: string[] = [];
    const invalidPageForms: Array<{ id: string; reason: string }> = [];
    for (const form of forms) {
      if (!form.pages?.length) {
        missingPageFormIds.push(String(form._id));
        continue;
      }
      try {
        assertValidPages(form.pages, form.kind, form.collectParticipants);
      } catch (cause) {
        invalidPageForms.push({
          id: String(form._id),
          reason: cause instanceof Error ? cause.message : "Invalid page configuration",
        });
      }
    }
    return {
      total: forms.length,
      withPages: forms.length - missingPageFormIds.length,
      missingPageFormIds,
      invalidPageForms,
    };
  },
});

// Repeatable, cursor-based CRM rollout. Existing speaker rows remain authoritative for
// event-specific history and portal access; this only adds organization contacts and memberships.
export const backfillCrmContacts = internalMutation({
  args: { cursor: v.optional(v.string()), batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("speakers").paginate({
      cursor: args.cursor ?? null,
      numItems: Math.min(Math.max(args.batchSize ?? 100, 1), 100),
    });
    let contactsCreated = 0;
    let speakersLinked = 0;
    let membershipsCreated = 0;
    for (const speaker of page.page) {
      const event = await ctx.db.get(speaker.eventId);
      if (!event?.organizationId) continue;
      const email = speaker.email.trim().toLowerCase();
      if (!email) continue;
      let contact = await ctx.db.query("crm_contacts")
        .withIndex("by_org_email", (q) => q.eq("organizationId", event.organizationId!).eq("email", email))
        .unique();
      if (!contact) {
        const now = Date.now();
        const contactId = await ctx.db.insert("crm_contacts", {
          organizationId: event.organizationId,
          email,
          firstName: speaker.firstName,
          lastName: speaker.lastName,
          stage: "confirmed",
          score: 50,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("crm_stage_history", {
          organizationId: event.organizationId,
          contactId,
          stage: "confirmed",
          score: 50,
          changedByUserId: "system:crm-backfill",
          createdAt: now,
        });
        contact = await ctx.db.get(contactId);
        contactsCreated += 1;
      }
      if (!contact) continue;
      if (speaker.contactId !== contact._id) {
        await ctx.db.patch(speaker._id, { contactId: contact._id });
        speakersLinked += 1;
      }
      const membership = await ctx.db.query("crm_event_contacts")
        .withIndex("by_event_contact", (q) => q.eq("eventId", speaker.eventId).eq("contactId", contact!._id))
        .unique();
      if (!membership) {
        const now = Date.now();
        await ctx.db.insert("crm_event_contacts", { eventId: speaker.eventId, contactId: contact._id, speakerId: speaker._id, createdAt: now, updatedAt: now });
        membershipsCreated += 1;
      } else if (membership.speakerId !== speaker._id) {
        await ctx.db.patch(membership._id, { speakerId: speaker._id, updatedAt: Date.now() });
      }
    }
    return { contactsCreated, speakersLinked, membershipsCreated, cursor: page.continueCursor, done: page.isDone };
  },
});

// Read-only, paginated verification for before/after rollout evidence.
export const auditCrmContacts = internalQuery({
  args: { cursor: v.optional(v.string()), batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("speakers").paginate({
      cursor: args.cursor ?? null,
      numItems: Math.min(Math.max(args.batchSize ?? 100, 1), 100),
    });
    const issues = { missingOrganization: 0, missingContact: 0, wrongOrganization: 0, emailMismatch: 0, missingMembership: 0 };
    for (const speaker of page.page) {
      const event = await ctx.db.get(speaker.eventId);
      if (!event?.organizationId) { issues.missingOrganization += 1; continue; }
      const contact = speaker.contactId ? await ctx.db.get(speaker.contactId) : null;
      if (!contact) { issues.missingContact += 1; continue; }
      if (contact.organizationId !== event.organizationId) issues.wrongOrganization += 1;
      if (contact.email !== speaker.email.trim().toLowerCase()) issues.emailMismatch += 1;
      const membership = await ctx.db.query("crm_event_contacts")
        .withIndex("by_event_contact", (q) => q.eq("eventId", speaker.eventId).eq("contactId", contact._id))
        .unique();
      if (!membership || membership.speakerId !== speaker._id) issues.missingMembership += 1;
    }
    return { checked: page.page.length, issues, cursor: page.continueCursor, done: page.isDone };
  },
});
