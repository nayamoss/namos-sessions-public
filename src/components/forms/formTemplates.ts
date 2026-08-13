import {
  Building2,
  Camera,
  Contact,
  CreditCard,
  FileText,
  Handshake,
  Mic,
  Monitor,
  Plane,
  Presentation,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { FieldDefinitionWrite, SubmissionFormKind } from "@/data/types";

export type FormTemplate = {
  id: string;
  appliesTo: "cfp" | "portal";
  name: string;
  description: string;
  icon: LucideIcon;
  kind: SubmissionFormKind;
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
      type: FieldDefinitionWrite["type"];
      required: boolean;
      maxChars?: number;
      options?: string[];
      locked?: boolean;
    }[];
  }[];
  portalFormSettings?: { sendConfirmationEmail: boolean; confirmationBody?: string };
};

// Keep field and form defaults in sync with the server-only catalog in
// convex/formTemplates.ts. This client copy additionally owns gallery copy and icons.
export const FORM_TEMPLATES: FormTemplate[] = [
  {
    id: "cfp-standard-abstract",
    appliesTo: "cfp",
    name: "Standard Abstract CFP",
    description: "Collect the essentials for a conference talk proposal.",
    icon: FileText,
    kind: "abstract",
    internalName: "Standard Abstract CFP",
    externalTitle: "Submit your proposal",
    pageHeading: "Proposal",
    collectParticipants: false,
    participantRoles: [],
    sections: [{
      key: "abstract", title: "Proposal", pageHeading: "Proposal",
      fields: [
        { label: "Title", type: "text", required: true, locked: true },
        { label: "Description", type: "wysiwyg", required: true },
        { label: "Format", type: "dropdown", required: true, options: ["Talk", "Workshop", "Panel"] },
        { label: "Track", type: "dropdown", required: true },
        { label: "Level", type: "dropdown", required: true, options: ["Beginner", "Intermediate", "Advanced"] },
        { label: "Tags", type: "multiselect", required: false },
      ],
    }],
  },
  {
    id: "cfp-full-session",
    appliesTo: "cfp",
    name: "Full Session Proposal",
    description: "Capture a detailed session plan and its intended audience.",
    icon: Presentation,
    kind: "session",
    internalName: "Full Session Proposal",
    externalTitle: "Submit a session proposal",
    pageHeading: "Session",
    collectParticipants: false,
    participantRoles: [],
    sections: [{
      key: "abstract", title: "Session proposal", pageHeading: "Session",
      fields: [
        { label: "Title", type: "text", required: true, locked: true },
        { label: "Description", type: "wysiwyg", required: true },
        { label: "Learning Objectives", type: "wysiwyg", required: true },
        { label: "Target Audience", type: "text", required: true },
        { label: "Format", type: "dropdown", required: true, options: ["Talk", "Workshop", "Panel"] },
        { label: "Track", type: "dropdown", required: true },
        { label: "Level", type: "dropdown", required: true, options: ["Beginner", "Intermediate", "Advanced"] },
      ],
    }],
  },
  {
    id: "cfp-workshop",
    appliesTo: "cfp",
    name: "Workshop Proposal",
    description: "Plan a hands-on workshop, including capacity and materials.",
    icon: Wrench,
    kind: "session",
    internalName: "Workshop Proposal",
    externalTitle: "Submit a workshop proposal",
    pageHeading: "Workshop",
    collectParticipants: false,
    participantRoles: [],
    sections: [{
      key: "abstract", title: "Workshop proposal", pageHeading: "Workshop",
      fields: [
        { label: "Title", type: "text", required: true, locked: true },
        { label: "Description", type: "wysiwyg", required: true },
        { label: "Duration", type: "dropdown", required: true, options: ["60 min", "90 min", "120 min", "180 min"] },
        { label: "Materials Needed", type: "text", required: false },
        { label: "Max Attendees", type: "number", required: true },
        { label: "Prerequisites", type: "wysiwyg", required: false },
      ],
    }],
  },
  {
    id: "cfp-lightning-talk",
    appliesTo: "cfp",
    name: "Lightning Talk",
    description: "Collect a concise proposal for a short lightning talk.",
    icon: Mic,
    kind: "abstract",
    internalName: "Lightning Talk",
    externalTitle: "Submit a lightning talk",
    pageHeading: "Lightning talk",
    collectParticipants: false,
    participantRoles: [],
    sections: [{
      key: "abstract", title: "Lightning talk", pageHeading: "Lightning talk",
      fields: [
        { label: "Title", type: "text", required: true, locked: true },
        { label: "Description", type: "wysiwyg", required: true, maxChars: 500 },
        { label: "Format", type: "text", required: true, options: ["Lightning Talk"], locked: true },
        { label: "Tags", type: "multiselect", required: false },
      ],
    }],
  },
  {
    id: "cfp-panel-discussion",
    appliesTo: "cfp",
    name: "Panel Discussion Proposal",
    description: "Propose a moderated discussion with multiple panelists.",
    icon: Users,
    kind: "session",
    internalName: "Panel Discussion Proposal",
    externalTitle: "Submit a panel proposal",
    pageHeading: "Panel",
    collectParticipants: true,
    participantRoles: [{ role: "Moderator", min: 1, max: 1 }, { role: "Panelist", min: 2, max: 5 }],
    sections: [{
      key: "abstract", title: "Panel proposal", pageHeading: "Panel",
      fields: [
        { label: "Title", type: "text", required: true, locked: true },
        { label: "Description", type: "wysiwyg", required: true },
      ],
    }],
  },
  {
    id: "cfp-sponsor-session",
    appliesTo: "cfp",
    name: "Sponsor Session Application",
    description: "Collect a sponsor's session details and company information.",
    icon: Handshake,
    kind: "session",
    internalName: "Sponsor Session Application",
    externalTitle: "Apply for a sponsor session",
    pageHeading: "Sponsor",
    collectParticipants: false,
    participantRoles: [],
    sections: [{
      key: "abstract", title: "Sponsor session", pageHeading: "Sponsor",
      fields: [
        { label: "Title", type: "text", required: true, locked: true },
        { label: "Description", type: "wysiwyg", required: true },
        { label: "Sponsor Tier", type: "dropdown", required: true, options: ["Bronze", "Silver", "Gold", "Platinum"] },
        { label: "Company Name", type: "text", required: true },
        { label: "Track", type: "text", required: true, options: ["Sponsored"], locked: true },
      ],
    }],
  },
  {
    id: "portal-speaker-contact-bio",
    appliesTo: "portal",
    name: "Speaker Contact & Bio",
    description: "Collect speaker contact details and a program-ready biography.",
    icon: Contact,
    kind: "contact",
    internalName: "Speaker Contact & Bio",
    externalTitle: "Speaker contact and bio",
    pageHeading: "Form",
    collectParticipants: false,
    participantRoles: [],
    sections: [{
      key: "portal", title: "Contact and bio", pageHeading: "Form",
      fields: [
        { label: "First Name", type: "text", required: true, locked: true },
        { label: "Last Name", type: "text", required: true, locked: true },
        { label: "Email", type: "email", required: true, locked: true },
        { label: "Mobile Phone", type: "phone", required: false },
        { label: "Biography", type: "wysiwyg", required: true, maxChars: 5000 },
      ],
    }],
    portalFormSettings: { sendConfirmationEmail: true },
  },
  {
    id: "portal-av-tech-requirements",
    appliesTo: "portal",
    name: "A/V & Tech Requirements",
    description: "Gather presentation setup, equipment, and accessibility needs.",
    icon: Monitor,
    kind: "submission_task",
    internalName: "A/V & Tech Requirements",
    externalTitle: "A/V and technical requirements",
    pageHeading: "Form",
    collectParticipants: false,
    participantRoles: [],
    sections: [{
      key: "portal", title: "Technical requirements", pageHeading: "Form",
      fields: [
        { label: "Presentation Format", type: "dropdown", required: true, options: ["Slides", "Live Demo", "Video"] },
        { label: "Special Equipment", type: "text", required: false },
        { label: "Laptop Provided?", type: "dropdown", required: true, options: ["Yes", "No"] },
        { label: "Accessibility Needs", type: "wysiwyg", required: false },
      ],
    }],
    portalFormSettings: { sendConfirmationEmail: true },
  },
  {
    id: "portal-travel-logistics",
    appliesTo: "portal",
    name: "Travel & Logistics",
    description: "Coordinate travel dates, lodging, dietary, and emergency details.",
    icon: Plane,
    kind: "submission_task",
    internalName: "Travel & Logistics",
    externalTitle: "Travel and logistics",
    pageHeading: "Form",
    collectParticipants: false,
    participantRoles: [],
    sections: [{
      key: "portal", title: "Travel and logistics", pageHeading: "Form",
      fields: [
        { label: "Arrival Date", type: "date", required: true },
        { label: "Departure Date", type: "date", required: true },
        { label: "Needs Hotel?", type: "dropdown", required: true, options: ["Yes", "No"] },
        { label: "Dietary Restrictions", type: "text", required: false },
        { label: "Emergency Contact", type: "text", required: true },
      ],
    }],
    portalFormSettings: { sendConfirmationEmail: true },
  },
  {
    id: "portal-headshot-bio-confirmation",
    appliesTo: "portal",
    name: "Headshot & Bio Confirmation",
    description: "Confirm the speaker assets used in the public program.",
    icon: Camera,
    kind: "contact",
    internalName: "Headshot & Bio Confirmation",
    externalTitle: "Confirm your headshot and bio",
    pageHeading: "Form",
    collectParticipants: false,
    participantRoles: [],
    sections: [{
      key: "portal", title: "Headshot and bio", pageHeading: "Form",
      fields: [
        { label: "Headshot", type: "file", required: true },
        { label: "Bio", type: "wysiwyg", required: true, locked: true },
        { label: "Twitter/X Handle", type: "text", required: false },
        { label: "Company/Title", type: "text", required: false },
      ],
    }],
    portalFormSettings: { sendConfirmationEmail: true },
  },
  {
    id: "portal-sponsor-exhibitor-deliverables",
    appliesTo: "portal",
    name: "Sponsor/Exhibitor Deliverables",
    description: "Collect brand assets, booth needs, and a primary contact.",
    icon: Building2,
    kind: "group",
    internalName: "Sponsor/Exhibitor Deliverables",
    externalTitle: "Sponsor and exhibitor deliverables",
    pageHeading: "Form",
    collectParticipants: false,
    participantRoles: [],
    sections: [{
      key: "portal", title: "Sponsor deliverables", pageHeading: "Form",
      fields: [
        { label: "Company Name", type: "text", required: true, locked: true },
        { label: "Logo", type: "file", required: true },
        { label: "Booth Requirements", type: "text", required: false },
        { label: "Contact Email", type: "email", required: true, locked: true },
      ],
    }],
    portalFormSettings: { sendConfirmationEmail: true },
  },
  {
    id: "portal-payment-w9",
    appliesTo: "portal",
    name: "Payment / W-9 Info",
    description: "Collect payment preferences, tax paperwork, and billing details.",
    icon: CreditCard,
    kind: "submission_task",
    internalName: "Payment / W-9 Info",
    externalTitle: "Payment and W-9 information",
    pageHeading: "Form",
    collectParticipants: false,
    participantRoles: [],
    sections: [{
      key: "portal", title: "Payment information", pageHeading: "Form",
      fields: [
        { label: "Legal Name", type: "text", required: true },
        { label: "Payment Method", type: "dropdown", required: true, options: ["Check", "ACH", "Wire"] },
        { label: "W-9 Upload", type: "file", required: true },
        { label: "Billing Address", type: "wysiwyg", required: true },
      ],
    }],
    portalFormSettings: { sendConfirmationEmail: true },
  },
];
