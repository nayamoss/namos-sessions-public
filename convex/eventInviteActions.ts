"use node";

import { createClerkClient } from "@clerk/backend";
import { isClerkAPIResponseError } from "@clerk/backend/errors";
import { v } from "convex/values";
import React from "react";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { deliverEventEmail } from "./emailDelivery";
import { renderEmail } from "./commsEmailRender";
import { TeamInvitationEmail } from "../src/emails/templates/team-invitation";
import { normalizeEventTeamEmail } from "../src/lib/event-team";

const role = v.union(v.literal("organizer"), v.literal("reviewer"));

function appUrl(path: string): string {
  const origin = process.env.PUBLIC_APP_ORIGIN;
  if (!origin) throw new Error("PUBLIC_APP_ORIGIN is not configured.");
  return new URL(path, origin).toString();
}

function requiredClerkSecret(): string {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not configured.");
  return secretKey;
}

function clerkFailure(cause: unknown, fallback: string): string {
  if (isClerkAPIResponseError(cause)) {
    return cause.errors.map((error) => error.longMessage || error.message).filter(Boolean).join(" ") || fallback;
  }
  return cause instanceof Error ? cause.message : fallback;
}

function canIgnoreRevokeFailure(cause: unknown): boolean {
  if (!isClerkAPIResponseError(cause)) return false;
  return cause.status === 404 || cause.errors.some((error) =>
    error.code === "resource_not_found" ||
    error.code === "invitation_already_revoked" ||
    error.code === "invitation_already_accepted" ||
    error.code === "invitation_expired"
  );
}

async function revokeClerkInvitation(invitationId: string, secretKey: string): Promise<void> {
  const clerk = createClerkClient({ secretKey });
  try {
    // @clerk/backend 3.x accepts the invitation id directly. This is Clerk's
    // POST /v1/invitations/:invitation_id/revoke endpoint, not a local status update.
    await clerk.invitations.revokeInvitation(invitationId);
  } catch (cause) {
    if (!canIgnoreRevokeFailure(cause)) throw cause;
  }
}

type SendInviteArgs = {
  eventId: Id<"events">;
  email: string;
  role: "organizer" | "reviewer";
};

async function sendEventInvite(ctx: ActionCtx, args: SendInviteArgs) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const email = normalizeEventTeamEmail(args.email);
  const prepared = await ctx.runMutation(internal.eventMembers.prepareInvite, {
    eventId: args.eventId,
    email,
    role: args.role,
  });

  const eventUrl = appUrl(`/events/${prepared.eventSlug}/dashboard`);
  const signUpUrl = appUrl(`/sign-up?redirect_url=${encodeURIComponent(eventUrl)}`);
  let invitationUrl = signUpUrl;
  let clerkInvitationId: string | undefined;
  let clerkInvitationCreated = false;
  let activated = false;
  const warnings: string[] = [];

  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    warnings.push("Clerk invitation was not created because CLERK_SECRET_KEY is not configured.");
  } else {
    const clerk = createClerkClient({ secretKey });
    try {
      // A resend is a real replacement: invalidate the prior Clerk ticket before
      // creating a fresh invitation URL, matching Beeconomy's proven flow.
      if (prepared.previousClerkInvitationId) {
        await revokeClerkInvitation(prepared.previousClerkInvitationId, secretKey);
      }

      const users = await clerk.users.getUserList({ emailAddress: [email] });
      const existingUser = users.data.at(0);
      if (existingUser) {
        await ctx.runMutation(internal.eventMembers.activateInvite, {
          memberId: prepared.memberId,
          userId: existingUser.id,
        });
        invitationUrl = eventUrl;
        activated = true;
      } else {
        const invitation = await clerk.invitations.createInvitation({
          emailAddress: email,
          ignoreExisting: true,
          notify: false,
          redirectUrl: signUpUrl,
          publicMetadata: {
            namosEventId: args.eventId,
            namosEventRole: args.role,
          },
        });
        clerkInvitationId = invitation.id;
        invitationUrl = invitation.url || signUpUrl;
        clerkInvitationCreated = true;
      }
    } catch (cause) {
      warnings.push(`Clerk invitation failed: ${clerkFailure(cause, "Unknown Clerk error.")}`);
    }
  }

  const subject = `You’re invited to join the ${prepared.eventName} team`;
  const { html, text } = await renderEmail(React.createElement(TeamInvitationEmail, {
    eventName: prepared.eventName,
    inviterEmail: typeof identity.email === "string" ? identity.email : undefined,
    invitationUrl,
    role: args.role,
  }));
  let emailSent = false;
  try {
    await deliverEventEmail(ctx, args.eventId, { to: email, subject, html, text });
    emailSent = true;
  } catch (cause) {
    warnings.push(cause instanceof Error ? `Invitation email failed: ${cause.message}` : "Invitation email failed.");
  }

  await ctx.runMutation(internal.eventMembers.recordInviteOutcome, {
    memberId: prepared.memberId,
    clerkInvitationId: activated
      ? undefined
      : clerkInvitationId ?? prepared.previousClerkInvitationId,
    emailStatus: emailSent ? "sent" : "failed",
    error: warnings.length ? warnings.join(" ") : undefined,
  });

  return {
    memberId: prepared.memberId,
    status: activated ? "active" as const : "pending" as const,
    clerkInvitationCreated,
    emailSent,
    warning: warnings.length ? warnings.join(" ") : undefined,
  };
}

export const invite = action({
  args: { eventId: v.id("events"), email: v.string(), role },
  handler: sendEventInvite,
});

export const resend = action({
  args: { eventId: v.id("events"), memberId: v.id("event_members") },
  handler: async (ctx, args) => {
    const invitation = await ctx.runQuery(internal.eventMembers.getPendingForResend, args);
    return sendEventInvite(ctx, {
      eventId: args.eventId,
      email: invitation.email,
      role: invitation.role,
    });
  },
});

export const remove = action({
  args: { eventId: v.id("events"), memberId: v.id("event_members") },
  handler: async (ctx, args): Promise<void> => {
    const target = await ctx.runQuery(internal.eventMembers.getRemovalTarget, args);
    if (target.pending && target.clerkInvitationId) {
      const secretKey = requiredClerkSecret();
      try {
        await revokeClerkInvitation(target.clerkInvitationId, secretKey);
      } catch (cause) {
        throw new Error(`Could not revoke the Clerk invitation: ${clerkFailure(cause, "Unknown Clerk error.")}`, { cause });
      }
    }
    await ctx.runMutation(internal.eventMembers.removeAfterClerkRevoke, {
      ...args,
      expectedClerkInvitationId: target.clerkInvitationId,
    });
  },
});
