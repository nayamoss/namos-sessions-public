import { verifyToken } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { buildEventAnalyticsSummary } from "../../src/lib/event-analytics";

type Env = {
  AIRTABLE_API_KEY?: string;
  AIRTABLE_BASE_ID?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_JWT_KEY?: string;
  CLERK_AUTHORIZED_PARTIES?: string;
  CONVEX_URL?: string;
};
type Operation = string;
type AirtableRecord = { id: string; fields: Record<string, unknown> };
type AirtableResponse = AirtableRecord & { records: AirtableRecord[] };

const tableFor: Record<Operation, string> = {
  "analytics.summary": "Events",
  "events.list": "Events", "events.get": "Events", "events.getBySlug": "Events", "events.save": "Events",
  "events.rooms.list": "Rooms", "events.rooms.save": "Rooms", "events.rooms.remove": "Rooms",
  "events.tracks.list": "Tracks", "events.tracks.save": "Tracks", "events.tracks.remove": "Tracks",
  "forms.list": "Submission Forms", "forms.fields": "Field Definitions",
  "submissions.list": "Submissions", "submissions.submit": "Submissions", "submissions.saveDraft": "Submissions", "submissions.createAdmin": "Submissions", "submissions.decide": "Submissions", "submissions.setStatus": "Submissions",
  "speakers.list": "Speakers", "speakers.create": "Speakers", "speakers.setConfirmationStatus": "Speakers", "evaluations.list": "Evaluations", "evaluations.save": "Evaluations", "agenda.list": "Agenda Items", "agenda.detectConflicts": "Agenda Items", "agenda.save": "Agenda Items", "agenda.publishSchedule": "Agenda Items",
  "tasks.list": "Onboarding Tasks", "tasks.create": "Onboarding Tasks", "tasks.setStatus": "Onboarding Tasks", "comms.list": "Comms Log", "availability.list": "Speaker Availability", "availability.upsert": "Speaker Availability",
};

function json(status: number, body: unknown) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
function record(document: AirtableRecord): { id: string } & Record<string, unknown> { return { id: document.id, ...document.fields }; }

function commaSeparated(value: string | undefined) {
  return new Set((value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean));
}

async function requireAdmin(request: Request, env: Env) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Response(JSON.stringify({ error: "Authentication is required." }), { status: 401, headers: { "content-type": "application/json" } });
  if (!env.CLERK_SECRET_KEY && !env.CLERK_JWT_KEY) throw new Error("Airtable backend requires CLERK_SECRET_KEY or CLERK_JWT_KEY for token verification.");
  const authorizedParties = [...commaSeparated(env.CLERK_AUTHORIZED_PARTIES)];
  const verified = await verifyToken(token, {
    ...(env.CLERK_SECRET_KEY ? { secretKey: env.CLERK_SECRET_KEY } : {}),
    ...(env.CLERK_JWT_KEY ? { jwtKey: env.CLERK_JWT_KEY } : {}),
    ...(authorizedParties.length ? { authorizedParties } : {}),
  });
  const userId = typeof verified.sub === "string" ? verified.sub : undefined;
  if (!userId) {
    throw new Response(JSON.stringify({ error: "An event administrator role is required." }), { status: 403, headers: { "content-type": "application/json" } });
  }
  if (!env.CONVEX_URL) throw new Error("Airtable backend requires CONVEX_URL for organizer authorization.");
  const client = new ConvexHttpClient(env.CONVEX_URL);
  client.setAuth(token);
  let isOrganizer = false;
  try {
    isOrganizer = await client.query(api.organizers.isCurrentUserOrganizer, {});
  } catch {
    // An unavailable or misconfigured authorization service must never grant Airtable access.
  }
  if (!isOrganizer) {
    throw new Response(JSON.stringify({ error: "An event administrator role is required." }), { status: 403, headers: { "content-type": "application/json" } });
  }
  return userId;
}

async function airtable(env: Env, path: string, init?: RequestInit) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("Airtable backend requires AIRTABLE_API_KEY and AIRTABLE_BASE_ID.");
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${path}`, { ...init, headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, "content-type": "application/json", ...init?.headers } });
  if (response.status === 429) throw new Error("Airtable rate limit reached; retry after 30 seconds.");
  if (!response.ok) throw new Error(`Airtable request failed (${response.status}).`);
  return response.json() as Promise<AirtableResponse>;
}

async function airtableEventRows(env: Env, tableName: string, eventId: unknown) {
  const rows: Array<{ id: string } & Record<string, unknown>> = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({
      pageSize: "100",
      filterByFormula: eventFilter(eventId),
    });
    if (offset) params.set("offset", offset);
    const result = await airtable(env, `${encodeURIComponent(tableName)}?${params}`);
    rows.push(...result.records.map(record));
    offset = typeof (result as { offset?: unknown }).offset === "string"
      ? (result as unknown as { offset: string }).offset
      : undefined;
  } while (offset);
  return rows;
}

function eventFilter(eventId: unknown) {
  if (typeof eventId !== "string" || !eventId) throw new Error("An eventId is required for this operation.");
  return `({eventId}='${eventId.replaceAll("'", "\\'")}')`;
}

function fieldsFor(operation: Operation, input: Record<string, unknown>) {
  if (operation === "submissions.submit" || operation === "submissions.saveDraft" || operation === "submissions.createAdmin") return input.input;
  return input;
}

function taskCreateFields(input: Record<string, unknown>) {
  const eventId = input.eventId;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const targetType = input.targetType;
  if (typeof eventId !== "string" || !eventId) throw new Error("An eventId is required to create a task.");
  if (!title) throw new Error("A task needs a title.");
  if (targetType !== "contact" && targetType !== "group" && targetType !== "submission") throw new Error("A task target type is required.");
  if (input.dueDate !== undefined && (typeof input.dueDate !== "number" || !Number.isFinite(input.dueDate))) throw new Error("A task due date must be a valid timestamp.");
  if (input.speakerId !== undefined && (typeof input.speakerId !== "string" || !input.speakerId)) throw new Error("A task speaker must be a valid record id.");
  if (input.submissionId !== undefined && (typeof input.submissionId !== "string" || !input.submissionId)) throw new Error("A task submission must be a valid record id.");
  if (input.linkedFormId !== undefined && (typeof input.linkedFormId !== "string" || !input.linkedFormId)) throw new Error("A task portal form must be a valid record id.");
  return { eventId, title, targetType, speakerId: input.speakerId, submissionId: input.submissionId, linkedFormId: input.linkedFormId, dueDate: input.dueDate, source: "manual", status: "pending" };
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  try {
    // This endpoint is private. Clerk validates the session on the server, then Convex checks
    // that the caller has an organizers-table row. The browser never supplies an organization
    // id or an Airtable credential.
    await requireAdmin(request, env);
    const { operation, input } = await request.json() as { operation?: Operation; input?: Record<string, unknown> };
    if (!operation || !input || !tableFor[operation]) return json(400, { error: "Unsupported data operation." });
    if (operation === "analytics.summary") {
      const [submissions, evaluations, assignments, speakers, agenda, communications, tasks] = await Promise.all([
        airtableEventRows(env, "Submissions", input.eventId),
        airtableEventRows(env, "Evaluations", input.eventId),
        airtableEventRows(env, "Evaluation Assignments", input.eventId),
        airtableEventRows(env, "Speakers", input.eventId),
        airtableEventRows(env, "Agenda Items", input.eventId),
        airtableEventRows(env, "Comms Log", input.eventId),
        airtableEventRows(env, "Onboarding Tasks", input.eventId),
      ]);
      return json(200, buildEventAnalyticsSummary({
        submissions: submissions.map((row) => ({ id: row.id, status: String(row.status || "pending") as never })),
        evaluations: evaluations.map((row) => ({ assignmentId: typeof row.assignmentId === "string" ? row.assignmentId : undefined })),
        assignments: assignments.map((row) => ({ id: row.id, submissionId: typeof row.submissionId === "string" ? row.submissionId : undefined, reviewerUserId: typeof row.reviewerUserId === "string" ? row.reviewerUserId : undefined })),
        speakers: speakers.map((row) => ({
          confirmationStatus: row.confirmationStatus === "confirmed" || row.confirmationStatus === "declined" ? row.confirmationStatus : "awaiting",
          bio: typeof row.bio === "string" ? row.bio : undefined,
          headshotStorageKey: typeof row.headshotStorageKey === "string" ? row.headshotStorageKey : undefined,
        })),
        agenda: agenda.map((row) => ({ submissionId: typeof row.submissionId === "string" ? row.submissionId : undefined, isPublished: row.isPublished === true })),
        communications: communications.map((row) => ({ status: row.status === "sent" || row.status === "failed" ? row.status : "queued" })),
        tasks: tasks.map((row) => ({
          status: row.status === "completed" || row.status === "in_progress" ? row.status : "pending",
          dueDate: typeof row.dueDate === "number" ? row.dueDate : undefined,
        })),
        // CRM is intentionally unavailable in the alternate Airtable mode. The count-only
        // analytics contract remains stable while the managed CRM section reports zero.
        crmContacts: [],
      }));
    }
    const table = encodeURIComponent(tableFor[operation]);
    if (operation === "events.getBySlug") {
      if (typeof input.slug !== "string" || !input.slug) return json(400, { error: "An event slug is required." });
      const params = new URLSearchParams({ maxRecords: "1", filterByFormula: `({slug}='${input.slug.replaceAll("'", "\\'")}')` });
      const result = await airtable(env, `${table}?${params}`);
      return json(200, result.records[0] ? record(result.records[0]) : null);
    }
    if (operation.endsWith(".list") || operation === "events.list") {
      const params = new URLSearchParams({ pageSize: "100" });
      if (operation !== "events.list") params.set("filterByFormula", eventFilter(input.eventId));
      const result = await airtable(env, `${table}?${params}`);
      return json(200, result.records.map(record));
    }
    if (operation === "events.get") return json(200, record(await airtable(env, `${table}/${encodeURIComponent(String(input.eventId))}`)));
    if (operation.endsWith(".remove")) {
      const eventId = typeof input.eventId === "string" ? input.eventId : "";
      const id = typeof input.id === "string" ? input.id : "";
      if (!eventId || !id) return json(400, { error: "An event-scoped record id is required for removal." });
      const existing = record(await airtable(env, `${table}/${encodeURIComponent(id)}`));
      if (existing.eventId !== eventId) return json(404, { error: "Record not found for this event." });
      await airtable(env, `${table}/${encodeURIComponent(id)}`, { method: "DELETE" });
      return json(200, null);
    }
    if (operation === "submissions.decide" || operation === "submissions.setStatus") { const result = await airtable(env, `${table}/${encodeURIComponent(String(input.submissionId))}`, { method: "PATCH", body: JSON.stringify({ fields: { status: input.status }, typecast: true }) }); return json(200, record(result)); }
    if (operation === "speakers.setConfirmationStatus") {
      const eventId = typeof input.eventId === "string" ? input.eventId : "";
      const speakerId = typeof input.speakerId === "string" ? input.speakerId : "";
      const status = input.status;
      if (!eventId || !speakerId || (status !== "awaiting" && status !== "confirmed" && status !== "declined")) return json(400, { error: "A valid event, speaker, and confirmation status are required." });
      const existing = record(await airtable(env, `${table}/${encodeURIComponent(speakerId)}`));
      if (existing.eventId !== eventId) return json(404, { error: "Speaker not found for this event." });
      await airtable(env, `${table}/${encodeURIComponent(speakerId)}`, { method: "PATCH", body: JSON.stringify({ fields: { confirmationStatus: status, updatedAt: Date.now() }, typecast: true }) });
      return json(200, null);
    }
    if (operation === "speakers.create") {
      const eventId = typeof input.eventId === "string" ? input.eventId : "";
      const firstName = typeof input.firstName === "string" ? input.firstName.trim() : "";
      const lastName = typeof input.lastName === "string" ? input.lastName.trim() : "";
      const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
      const confirmationStatus = input.confirmationStatus === "confirmed" || input.confirmationStatus === "declined" ? input.confirmationStatus : "awaiting";
      if (!eventId || !firstName || !lastName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "First name, last name, and a valid email are required." });
      const duplicateParams = new URLSearchParams({ maxRecords: "1", filterByFormula: `AND({eventId}='${eventId.replaceAll("'", "\\'")}', LOWER({email})='${email.replaceAll("'", "\\'")}')` });
      const duplicate = await airtable(env, `${table}?${duplicateParams}`);
      if (duplicate.records.length) return json(409, { error: "A speaker with this email already exists for this event." });
      const now = Date.now();
      const result = await airtable(env, table, { method: "POST", body: JSON.stringify({ fields: { eventId, firstName, lastName, email, confirmationStatus, status: "active", createdAt: now, updatedAt: now }, typecast: true }) });
      return json(200, record(result).id);
    }
    if (operation === "tasks.setStatus") { const result = await airtable(env, `${table}/${encodeURIComponent(String(input.id))}`, { method: "PATCH", body: JSON.stringify({ fields: { status: input.status, completedAt: input.status === "completed" ? Date.now() : null }, typecast: true }) }); return json(200, record(result)); }
    if (operation === "tasks.create") {
      const fields = taskCreateFields(input);
      for (const [tableName, recordId, label] of [["Speakers", fields.speakerId, "speaker"], ["Submissions", fields.submissionId, "submission"], ["Submission Forms", fields.linkedFormId, "portal form"]] as const) {
        if (!recordId) continue;
        const linked = record(await airtable(env, `${encodeURIComponent(tableName)}/${encodeURIComponent(String(recordId))}`));
        if (linked.eventId !== fields.eventId) throw new Error(`The selected ${label} does not belong to this event.`);
        if (label === "portal form" && linked.kind !== "contact" && linked.kind !== "group" && linked.kind !== "submission_task") throw new Error("Tasks can only link to portal forms.");
      }
      const result = await airtable(env, table, { method: "POST", body: JSON.stringify({ fields, typecast: true }) });
      return json(200, record(result));
    }
    if (operation === "availability.upsert") {
      const params = new URLSearchParams({ maxRecords: "1", filterByFormula: `AND({eventId}='${String(input.eventId).replaceAll("'", "\\'")}', {speakerId}='${String(input.speakerId).replaceAll("'", "\\'")}')` });
      const existing = await airtable(env, `${table}?${params}`);
      const path = existing.records[0] ? `${table}/${encodeURIComponent(existing.records[0].id)}` : table;
      const result = await airtable(env, path, { method: existing.records[0] ? "PATCH" : "POST", body: JSON.stringify({ fields: input, typecast: true }) });
      return json(200, record(result));
    }
    if (operation === "agenda.detectConflicts") return json(501, { error: "Airtable availability-aware conflict detection is not configured. Use the Convex data backend for persisted agenda conflicts." });
    if (operation === "agenda.publishSchedule") return json(501, { error: "Airtable schedule publishing must be configured with an explicit event view." });
    const id = input.id as string | undefined;
    const result = await airtable(env, id ? `${table}/${encodeURIComponent(id)}` : table, { method: id ? "PATCH" : "POST", body: JSON.stringify({ fields: fieldsFor(operation, input), typecast: true }) });
    return json(200, record(result));
  } catch (error) {
    if (error instanceof Response) return error;
    return json(500, { error: error instanceof Error ? error.message : "Data request failed." });
  }
}
