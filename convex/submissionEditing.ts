import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { assertCrossFieldLimits } from "./publicFormValidation";
import { requireIdentity } from "./functions";
import { assertOwnsSpeaker } from "./speakers";

// Phase 0 evidence (2026-08-11): a live Convex snapshot showed that publicForms.submit
// persists browser field-N answers as answers.fieldValues keyed by real field-definition
// ids. Legacy seed/saveDraft rows are flat semantic objects; createAdmin rows have no
// speaker. Speaker editing therefore uses real ids, preserves the complete stored envelope,
// and treats unmatched legacy values as archived instead of dropping them.

export type SubmissionEditLockReason = "under_review" | "decision_recorded" | "submissions_closed";
export type SubmissionEditability =
  | { editable: true; mode: "draft" | "submitted" }
  | { editable: false; reason: SubmissionEditLockReason; closedAt?: number };

const SPEAKER_EDITABLE = new Set(["draft", "pending", "maybe", "withdrawn"]);
const NOT_AVAILABLE = "That submission is not available on your portal.";

export async function requireOwnSubmission(
  ctx: QueryCtx | MutationCtx,
  args: { eventId: Id<"events">; submissionId: Id<"submissions">; speakerId: Id<"speakers"> },
) {
  const submission = await ctx.db.get(args.submissionId);
  if (!submission || submission.eventId !== args.eventId || submission.speakerId !== args.speakerId) {
    throw new Error(NOT_AVAILABLE);
  }
  const speaker = await ctx.db.get(args.speakerId);
  if (!speaker || speaker.eventId !== args.eventId) throw new Error(NOT_AVAILABLE);
  try {
    const identity = await requireIdentity(ctx);
    assertOwnsSpeaker(identity, speaker);
  } catch {
    throw new Error(NOT_AVAILABLE);
  }
  return submission;
}

export function evaluateEditability(
  submission: Pick<Doc<"submissions">, "status">,
  form: Pick<Doc<"submission_forms">, "status" | "closeDate">,
  now: number,
): SubmissionEditability {
  if (submission.status === "accept_queue" || submission.status === "decline_queue") return { editable: false, reason: "under_review" };
  if (submission.status === "accepted" || submission.status === "declined") return { editable: false, reason: "decision_recorded" };
  if (form.status !== "open") return { editable: false, reason: "submissions_closed", ...(form.closeDate !== undefined ? { closedAt: form.closeDate } : {}) };
  if (form.closeDate !== undefined && form.closeDate <= now) return { editable: false, reason: "submissions_closed", closedAt: form.closeDate };
  if (!SPEAKER_EDITABLE.has(submission.status)) return { editable: false, reason: "under_review" };
  return { editable: true, mode: submission.status === "draft" ? "draft" : "submitted" };
}

type EditableField = Pick<Doc<"field_definitions">, "_id" | "label" | "required" | "maxChars" | "showIf">;

export function assertAnswers(input: {
  fields: EditableField[];
  crossFieldLimits: Array<{ label: string; fieldIds: string[]; maxCombinedChars: number }>;
  answers: Record<string, string>;
  title: string;
  requireRequired: boolean;
}) {
  const knownIds = new Set(input.fields.map((field) => String(field._id)));
  for (const key of Object.keys(input.answers)) {
    if (!knownIds.has(key)) throw new Error("The submission contains an unknown form field.");
  }
  if (input.requireRequired && !input.title.trim()) throw new Error("A submission title is required.");
  for (const field of input.fields) {
    const id = String(field._id);
    const value = input.answers[id] ?? "";
    const visible = !field.showIf || input.answers[field.showIf.fieldId] === field.showIf.equals;
    if (input.requireRequired && visible && field.required && !value.trim()) throw new Error(`${field.label} is required.`);
    if (field.maxChars !== undefined && value.length > field.maxChars) throw new Error(`${field.label} exceeds its character limit.`);
  }
  assertCrossFieldLimits(input.crossFieldLimits, new Map(input.fields.map((field) => [String(field._id), String(field._id)])), input.answers);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function readEditableAnswers(raw: unknown, fields: EditableField[]) {
  const envelope = isRecord(raw) ? raw : {};
  const storedValues = isRecord(envelope.fieldValues) ? envelope.fieldValues : envelope;
  const labels = isRecord(envelope.fieldLabels) ? envelope.fieldLabels : {};
  const fieldIds = new Set(fields.map((field) => String(field._id)));
  const answers: Record<string, string> = {};
  const archivedAnswers: Array<{ key: string; label: string; value: string }> = [];
  for (const [key, value] of Object.entries(storedValues)) {
    if (typeof value !== "string" || key === "email") continue;
    if (fieldIds.has(key)) answers[key] = value;
    else archivedAnswers.push({ key, label: typeof labels[key] === "string" ? labels[key] as string : key, value });
  }
  return { answers, archivedAnswers };
}

export function mergeEditableAnswers(raw: unknown, answers: Record<string, string>) {
  const envelope = isRecord(raw) ? raw : {};
  const currentFieldValues = isRecord(envelope.fieldValues) ? envelope.fieldValues : {};
  return { ...envelope, fieldValues: { ...currentFieldValues, ...answers } };
}
