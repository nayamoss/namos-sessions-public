type TemplateFieldType = "text" | "wysiwyg" | "dropdown" | "multiselect" | "email" | "phone" | "file" | "date" | "number";
type TemplateKind = "abstract" | "session" | "contact" | "group" | "submission_task";

export type ServerFormTemplate = {
  id: string;
  appliesTo: "cfp" | "portal";
  kind: TemplateKind;
  internalName: string;
  externalTitle: string;
  pageHeading: string;
  collectParticipants: boolean;
  participantRoles: { role: string; min?: number; max?: number }[];
  sections: {
    key: "abstract" | "participant" | "portal";
    title: string;
    pageHeading: string;
    description?: string;
    fields: {
      label: string;
      type: TemplateFieldType;
      required: boolean;
      maxChars?: number;
      options?: string[];
      locked?: boolean;
    }[];
  }[];
  portalFormSettings?: { sendConfirmationEmail: boolean; confirmationBody?: string };
};

export const normalizeTemplateFieldLabel = (label: string) => label.trim().toLowerCase();

export type TemplateFieldPlanEntry = {
  normalizedLabel: string;
  label: string;
  type: TemplateFieldType;
  maxChars?: number;
  options?: string[];
  locked: boolean;
  required: boolean;
};

export type TemplateFieldPlan = {
  sections: {
    key: "abstract" | "participant" | "portal";
    title: string;
    pageHeading: string;
    description?: string;
    fieldRefs: string[]; // normalized labels, in order — resolve against fieldsToCreate + the caller's existing fields
  }[];
  // Fields not found among the labels passed in as `existingLabels` — deduped against each
  // other too, so a template that lists the same label twice only creates it once.
  fieldsToCreate: TemplateFieldPlanEntry[];
};

// Pure planning step for `forms:createFromTemplate` (see convex/forms.ts). Kept side-effect-free
// and exported so the field-library dedupe logic — reuse an existing field_definitions row
// rather than creating a duplicate for the same label — is directly testable without a live
// Convex ctx, matching the categoryRouting.ts convention (business logic extracted, pure,
// unit-tested; the mutation itself only orchestrates ctx.db calls around it).
export function planTemplateFields(template: ServerFormTemplate, existingLabels: Iterable<string>): TemplateFieldPlan {
  const known = new Set(Array.from(existingLabels, normalizeTemplateFieldLabel));
  const toCreate = new Map<string, TemplateFieldPlanEntry>();
  const sections = template.sections.map(section => {
    const fieldRefs: string[] = [];
    for (const field of section.fields) {
      const label = field.label.trim();
      const normalizedLabel = normalizeTemplateFieldLabel(label);
      fieldRefs.push(normalizedLabel);
      if (!known.has(normalizedLabel) && !toCreate.has(normalizedLabel)) {
        toCreate.set(normalizedLabel, {
          normalizedLabel, label,
          type: field.type, maxChars: field.maxChars, options: field.options,
          locked: field.locked ?? false, required: field.required,
        });
      }
    }
    return { key: section.key, title: section.title, pageHeading: section.pageHeading, description: section.description, fieldRefs };
  });
  return { sections, fieldsToCreate: [...toCreate.values()] };
}

// Keep this server-only subset in sync with the gallery catalog in
// src/components/forms/formTemplates.ts. Icons and gallery copy intentionally live there only.
export const FORM_TEMPLATES: ServerFormTemplate[] = [
  {
    id: "cfp-standard-abstract", appliesTo: "cfp", kind: "abstract",
    internalName: "Standard Abstract CFP", externalTitle: "Submit your proposal", pageHeading: "Proposal",
    collectParticipants: false, participantRoles: [],
    sections: [{ key: "abstract", title: "Proposal", pageHeading: "Proposal", fields: [
      { label: "Title", type: "text", required: true, locked: true },
      { label: "Description", type: "wysiwyg", required: true },
      { label: "Format", type: "dropdown", required: true, options: ["Talk", "Workshop", "Panel"] },
      { label: "Track", type: "dropdown", required: true },
      { label: "Level", type: "dropdown", required: true, options: ["Beginner", "Intermediate", "Advanced"] },
      { label: "Tags", type: "multiselect", required: false },
    ] }],
  },
  {
    id: "cfp-full-session", appliesTo: "cfp", kind: "session",
    internalName: "Full Session Proposal", externalTitle: "Submit a session proposal", pageHeading: "Session",
    collectParticipants: false, participantRoles: [],
    sections: [{ key: "abstract", title: "Session proposal", pageHeading: "Session", fields: [
      { label: "Title", type: "text", required: true, locked: true },
      { label: "Description", type: "wysiwyg", required: true },
      { label: "Learning Objectives", type: "wysiwyg", required: true },
      { label: "Target Audience", type: "text", required: true },
      { label: "Format", type: "dropdown", required: true, options: ["Talk", "Workshop", "Panel"] },
      { label: "Track", type: "dropdown", required: true },
      { label: "Level", type: "dropdown", required: true, options: ["Beginner", "Intermediate", "Advanced"] },
    ] }],
  },
  {
    id: "cfp-workshop", appliesTo: "cfp", kind: "session",
    internalName: "Workshop Proposal", externalTitle: "Submit a workshop proposal", pageHeading: "Workshop",
    collectParticipants: false, participantRoles: [],
    sections: [{ key: "abstract", title: "Workshop proposal", pageHeading: "Workshop", fields: [
      { label: "Title", type: "text", required: true, locked: true },
      { label: "Description", type: "wysiwyg", required: true },
      { label: "Duration", type: "dropdown", required: true, options: ["60 min", "90 min", "120 min", "180 min"] },
      { label: "Materials Needed", type: "text", required: false },
      { label: "Max Attendees", type: "number", required: true },
      { label: "Prerequisites", type: "wysiwyg", required: false },
    ] }],
  },
  {
    id: "cfp-lightning-talk", appliesTo: "cfp", kind: "abstract",
    internalName: "Lightning Talk", externalTitle: "Submit a lightning talk", pageHeading: "Lightning talk",
    collectParticipants: false, participantRoles: [],
    sections: [{ key: "abstract", title: "Lightning talk", pageHeading: "Lightning talk", fields: [
      { label: "Title", type: "text", required: true, locked: true },
      { label: "Description", type: "wysiwyg", required: true, maxChars: 500 },
      { label: "Format", type: "text", required: true, options: ["Lightning Talk"], locked: true },
      { label: "Tags", type: "multiselect", required: false },
    ] }],
  },
  {
    id: "cfp-panel-discussion", appliesTo: "cfp", kind: "session",
    internalName: "Panel Discussion Proposal", externalTitle: "Submit a panel proposal", pageHeading: "Panel",
    collectParticipants: true,
    participantRoles: [{ role: "Moderator", min: 1, max: 1 }, { role: "Panelist", min: 2, max: 5 }],
    sections: [{ key: "abstract", title: "Panel proposal", pageHeading: "Panel", fields: [
      { label: "Title", type: "text", required: true, locked: true },
      { label: "Description", type: "wysiwyg", required: true },
    ] }],
  },
  {
    id: "cfp-sponsor-session", appliesTo: "cfp", kind: "session",
    internalName: "Sponsor Session Application", externalTitle: "Apply for a sponsor session", pageHeading: "Sponsor",
    collectParticipants: false, participantRoles: [],
    sections: [{ key: "abstract", title: "Sponsor session", pageHeading: "Sponsor", fields: [
      { label: "Title", type: "text", required: true, locked: true },
      { label: "Description", type: "wysiwyg", required: true },
      { label: "Sponsor Tier", type: "dropdown", required: true, options: ["Bronze", "Silver", "Gold", "Platinum"] },
      { label: "Company Name", type: "text", required: true },
      { label: "Track", type: "text", required: true, options: ["Sponsored"], locked: true },
    ] }],
  },
  {
    id: "portal-speaker-contact-bio", appliesTo: "portal", kind: "contact",
    internalName: "Speaker Contact & Bio", externalTitle: "Speaker contact and bio", pageHeading: "Form",
    collectParticipants: false, participantRoles: [],
    sections: [{ key: "portal", title: "Contact and bio", pageHeading: "Form", fields: [
      { label: "First Name", type: "text", required: true, locked: true },
      { label: "Last Name", type: "text", required: true, locked: true },
      { label: "Email", type: "email", required: true, locked: true },
      { label: "Mobile Phone", type: "phone", required: false },
      { label: "Biography", type: "wysiwyg", required: true, maxChars: 5000 },
    ] }],
    portalFormSettings: { sendConfirmationEmail: true },
  },
  {
    id: "portal-av-tech-requirements", appliesTo: "portal", kind: "submission_task",
    internalName: "A/V & Tech Requirements", externalTitle: "A/V and technical requirements", pageHeading: "Form",
    collectParticipants: false, participantRoles: [],
    sections: [{ key: "portal", title: "Technical requirements", pageHeading: "Form", fields: [
      { label: "Presentation Format", type: "dropdown", required: true, options: ["Slides", "Live Demo", "Video"] },
      { label: "Special Equipment", type: "text", required: false },
      { label: "Laptop Provided?", type: "dropdown", required: true, options: ["Yes", "No"] },
      { label: "Accessibility Needs", type: "wysiwyg", required: false },
    ] }],
    portalFormSettings: { sendConfirmationEmail: true },
  },
  {
    id: "portal-travel-logistics", appliesTo: "portal", kind: "submission_task",
    internalName: "Travel & Logistics", externalTitle: "Travel and logistics", pageHeading: "Form",
    collectParticipants: false, participantRoles: [],
    sections: [{ key: "portal", title: "Travel and logistics", pageHeading: "Form", fields: [
      { label: "Arrival Date", type: "date", required: true },
      { label: "Departure Date", type: "date", required: true },
      { label: "Needs Hotel?", type: "dropdown", required: true, options: ["Yes", "No"] },
      { label: "Dietary Restrictions", type: "text", required: false },
      { label: "Emergency Contact", type: "text", required: true },
    ] }],
    portalFormSettings: { sendConfirmationEmail: true },
  },
  {
    id: "portal-headshot-bio-confirmation", appliesTo: "portal", kind: "contact",
    internalName: "Headshot & Bio Confirmation", externalTitle: "Confirm your headshot and bio", pageHeading: "Form",
    collectParticipants: false, participantRoles: [],
    sections: [{ key: "portal", title: "Headshot and bio", pageHeading: "Form", fields: [
      { label: "Headshot", type: "file", required: true },
      { label: "Bio", type: "wysiwyg", required: true, locked: true },
      { label: "Twitter/X Handle", type: "text", required: false },
      { label: "Company/Title", type: "text", required: false },
    ] }],
    portalFormSettings: { sendConfirmationEmail: true },
  },
  {
    id: "portal-sponsor-exhibitor-deliverables", appliesTo: "portal", kind: "group",
    internalName: "Sponsor/Exhibitor Deliverables", externalTitle: "Sponsor and exhibitor deliverables", pageHeading: "Form",
    collectParticipants: false, participantRoles: [],
    sections: [{ key: "portal", title: "Sponsor deliverables", pageHeading: "Form", fields: [
      { label: "Company Name", type: "text", required: true, locked: true },
      { label: "Logo", type: "file", required: true },
      { label: "Booth Requirements", type: "text", required: false },
      { label: "Contact Email", type: "email", required: true, locked: true },
    ] }],
    portalFormSettings: { sendConfirmationEmail: true },
  },
  {
    id: "portal-payment-w9", appliesTo: "portal", kind: "submission_task",
    internalName: "Payment / W-9 Info", externalTitle: "Payment and W-9 information", pageHeading: "Form",
    collectParticipants: false, participantRoles: [],
    sections: [{ key: "portal", title: "Payment information", pageHeading: "Form", fields: [
      { label: "Legal Name", type: "text", required: true },
      { label: "Payment Method", type: "dropdown", required: true, options: ["Check", "ACH", "Wire"] },
      { label: "W-9 Upload", type: "file", required: true },
      { label: "Billing Address", type: "wysiwyg", required: true },
    ] }],
    portalFormSettings: { sendConfirmationEmail: true },
  },
];
