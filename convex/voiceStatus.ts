import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertEventOrganizerAccess } from "./functions";

/** Safe for the composer to query: it exposes configuration state, never secrets. */
export const status = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const available = Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID);
    return available
      ? { available: true as const }
      : { available: false as const, reason: "Voice chat is not configured for this deployment. Ask an administrator to add ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID to Convex." };
  },
});
