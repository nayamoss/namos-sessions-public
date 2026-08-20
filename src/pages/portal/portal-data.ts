export type PortalSubmission = { id: string; code: string; title: string; type: string; status: "pending" | "accepted" | "accept_queue" | "decline_queue" | "declined"; updatedAt: string };
export function portalSubmissionStatusLabel(status: string) { return status === "maybe" ? "Under review" : status; }
export type PortalTask = { id: string; title: string; scope: "submission" | "profile"; complete: boolean; due: string };
export type PortalProfile = { firstName: string; lastName: string; email: string; bio: string; salutation: string; honorific: string; pronouns: string; gender: string; linkedinUrl: string; xUrl: string; facebookUrl: string; websiteUrl: string };

export const demoSubmissions: PortalSubmission[] = [
  { id: "submission-1", code: "SESS-4 – sd", title: "Building durable AI systems", type: "Featured Keynote", status: "accepted", updatedAt: "Accepted today" },
  { id: "submission-2", code: "SESS-7 – sd", title: "Human-centered automation", type: "Keynote", status: "pending", updatedAt: "Updated yesterday" },
];
export const demoTasks: PortalTask[] = [
  { id: "task-1", title: "Confirm your session details", scope: "submission", complete: false, due: "Due Aug 20" },
  { id: "task-2", title: "Upload your headshot", scope: "profile", complete: false, due: "Due Aug 20" },
  { id: "task-3", title: "Review speaker guidelines", scope: "profile", complete: true, due: "Completed" },
];
export const defaultProfile: PortalProfile = { firstName: "Sam", lastName: "Diaz", email: "", bio: "<p>Product leader and speaker focused on practical AI systems.</p>", salutation: "", honorific: "", pronouns: "they/them", gender: "", linkedinUrl: "", xUrl: "", facebookUrl: "", websiteUrl: "" };

export type PortalProfileScope = { eventId: string; speakerId: string; speakerName: string };

export function defaultPortalProfile(): PortalProfile {
  return { ...defaultProfile, firstName: "", lastName: "", email: "" };
}
