import { describe, expect, it } from "vitest";
import { createRows, valueFromAnswers } from "@/pages/program/Abstracts";
import type { FieldDefinition, Submission, SubmissionForm } from "@/data/types";

// Real bug found by browser QA (2026-08-12): a submitted CFP's Abstract field showed as "—" in
// organizer review. Dynamic-form answers are keyed by opaque generated field ids under
// `fieldValues`, with a parallel `fieldLabels` map from id to the human label an organizer
// configured (e.g. "Abstract") — they are never flat keys like "abstract". Only `email` is a
// real flat key (set separately, from the account step). valueFromAnswers must resolve
// id -> label -> value for everything else, not assume a literal key match.
describe("valueFromAnswers", () => {
  const answersEnvelope = {
    email: "speaker@example.test",
    fieldLabels: {
      field_1: "Session title",
      field_2: "Abstract",
      field_3: "Audience",
    },
    fieldValues: {
      field_1: "A talk about reactive systems",
      field_2: "This is the submitted abstract body.",
      field_3: "Backend engineers",
    },
  };

  it("resolves a value stored under an opaque field id via its label", () => {
    expect(valueFromAnswers(answersEnvelope, ["abstract", "description", "summary"])).toBe(
      "This is the submitted abstract body.",
    );
  });

  it("matches labels case-insensitively", () => {
    expect(valueFromAnswers(answersEnvelope, ["ABSTRACT"])).toBe("This is the submitted abstract body.");
  });

  it("still reads a real flat key (e.g. email) before falling back to label resolution", () => {
    expect(valueFromAnswers(answersEnvelope, ["email", "contactEmail"])).toBe("speaker@example.test");
  });

  it("returns empty when no flat key or label matches", () => {
    expect(valueFromAnswers(answersEnvelope, ["track", "topic"])).toBe("");
  });

  it("does not throw when fieldLabels/fieldValues are missing (organizer-created rows)", () => {
    expect(valueFromAnswers({ description: "Manually entered" }, ["abstract", "description"])).toBe(
      "Manually entered",
    );
    expect(valueFromAnswers(undefined, ["abstract"])).toBe("");
  });

  it("uses the form's stable abstract field id when its organizer-visible label is custom", () => {
    const form = {
      id: "form-1", eventId: "event-1", name: "Custom CFP", isOpen: true,
      sections: [{ id: "proposal", key: "abstract", title: "Proposal", pageHeading: "Proposal", fieldIds: ["title-id", "cover-id"] }],
    } as unknown as SubmissionForm;
    const fields: FieldDefinition[] = [
      { id: "title-id", label: "Name your session", type: "text", required: true },
      { id: "cover-id", label: "What will you cover?", type: "wysiwyg", required: true },
    ];
    const submission = {
      id: "submission-1", eventId: "event-1", formId: form.id, speakerIds: [], tagIds: [], status: "pending", title: "Reliable systems",
      answers: { fieldLabels: { "title-id": "Name your session", "cover-id": "What will you cover?" }, fieldValues: { "title-id": "Reliable systems", "cover-id": "The real submitted abstract." } },
    } as unknown as Submission;

    const [row] = createRows({ submissions: [submission], speakers: [], evaluations: [], forms: [form], fields, comms: [], tags: [] });

    expect(row.description).toBe("The real submitted abstract.");
  });
});
