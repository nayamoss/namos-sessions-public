"use node";

import { createHash, randomBytes } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";

export const generate = action({
  args: { eventId: v.id("events"), label: v.string(), scopes: v.array(v.string()) },
  handler: async (ctx, args): Promise<{ id: string; rawKey: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !(await ctx.runQuery(api.apiKeys.canManage, { eventId: args.eventId }))) {
      throw new Error("Forbidden: event organizer access required.");
    }
    const label = args.label.trim();
    if (!label) throw new Error("Give this key a label.");
    if (label.length > 80) throw new Error("API key labels must be 80 characters or fewer.");
    const scopes = [...new Set(args.scopes)].filter((scope): scope is typeof import("./apiKeyAuth").API_SCOPES[number] => ["events:read", "submissions:read", "submissions:write", "speakers:read", "agenda:read", "tasks:read"].includes(scope));
    if (!scopes.length || scopes.length !== args.scopes.length) throw new Error("Select at least one valid permission.");
    const rawKey = `ns_live_${randomBytes(24).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const id = await ctx.runMutation(internal.apiKeys.storeInternal, {
      eventId: args.eventId,
      label,
      keyHash,
      keyPrefix: rawKey.slice(0, 16),
      scopes,
      createdByUserId: identity.subject,
    });
    return { id, rawKey };
  },
});
