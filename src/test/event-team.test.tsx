import { render } from "@react-email/render";
import React from "react";
import { describe, expect, it } from "vitest";
import { TeamInvitationEmail } from "@/emails/templates/team-invitation";
import {
  EVENT_TEAM_MEMBER_LIMIT,
  eventTeamSeatsRemaining,
  isEventTeamEmail,
  isLastConfirmedEventOrganizer,
  normalizeEventTeamEmail,
} from "@/lib/event-team";

describe("event team invitations", () => {
  it("normalizes exact-email invite identities", () => {
    expect(normalizeEventTeamEmail("  Teammate@Example.COM ")).toBe("teammate@example.com");
    expect(isEventTeamEmail("teammate@example.com")).toBe(true);
    expect(isEventTeamEmail("not-an-email")).toBe(false);
  });

  it("uses the configured eight-person cap without returning negative seats", () => {
    expect(EVENT_TEAM_MEMBER_LIMIT).toBe(8);
    expect(eventTeamSeatsRemaining(3)).toBe(5);
    expect(eventTeamSeatsRemaining(8)).toBe(0);
    expect(eventTeamSeatsRemaining(10)).toBe(0);
  });

  it("allows a lone pending organizer invitation to be revoked", () => {
    const pendingOrganizer = {
      userId: "pending:invitee@example.com",
      role: "organizer" as const,
    };

    expect(isLastConfirmedEventOrganizer(pendingOrganizer, [pendingOrganizer])).toBe(false);
  });

  it("blocks removing a lone confirmed organizer even when a pending organizer invite exists", () => {
    const confirmedOrganizer = {
      userId: "user_confirmed",
      role: "organizer" as const,
    };
    const pendingOrganizer = {
      userId: "pending:invitee@example.com",
      role: "organizer" as const,
    };

    expect(
      isLastConfirmedEventOrganizer(confirmedOrganizer, [
        confirmedOrganizer,
        pendingOrganizer,
      ]),
    ).toBe(true);
  });

  it("renders one branded event-scoped invitation with its Clerk acceptance URL", async () => {
    const html = await render(
      React.createElement(TeamInvitationEmail, {
        eventName: "Namos Summit",
        inviterEmail: "owner@example.com",
        invitationUrl: "https://accounts.example.test/invitations/inv_123",
        role: "organizer",
      }),
    );

    expect(html).toContain("Join the Namos Summit team");
    expect(html).toContain("owner@example.com");
    expect(html).toContain("https://accounts.example.test/invitations/inv_123");
    expect(html).toContain("limited to this event");
  });
});
