export const EVENT_TEAM_MEMBER_LIMIT = 8;

export function normalizeEventTeamEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEventTeamEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEventTeamEmail(email));
}

export function eventTeamSeatsRemaining(memberCount: number): number {
  return Math.max(0, EVENT_TEAM_MEMBER_LIMIT - memberCount);
}

type EventTeamMembership = {
  userId: string;
  role: "organizer" | "reviewer";
};

export function isPendingEventTeamMember(member: Pick<EventTeamMembership, "userId">): boolean {
  return member.userId.startsWith("pending:");
}

export function isLastConfirmedEventOrganizer(
  target: EventTeamMembership,
  members: EventTeamMembership[],
): boolean {
  if (target.role !== "organizer" || isPendingEventTeamMember(target)) return false;
  return members.filter(
    (member) => member.role === "organizer" && !isPendingEventTeamMember(member),
  ).length === 1;
}
