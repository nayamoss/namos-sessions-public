import type { CrmStage } from "@/data/types";

// Shared between the event-scoped Contacts page and the organization-wide CRM workspace (#268)
// so the eight-stage pipeline reads identically in both places.
export const crmStages: CrmStage[] = [
  "prospect", "contacted", "qualified", "invited", "negotiating", "confirmed", "declined", "archived",
];

export const crmStageLabel: Record<CrmStage, string> = {
  prospect: "Prospect",
  contacted: "Contacted",
  qualified: "Qualified",
  invited: "Invited",
  negotiating: "Negotiating",
  confirmed: "Confirmed",
  declined: "Declined",
  archived: "Archived",
};
