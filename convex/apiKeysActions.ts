"use node";

import { createHash, randomBytes } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";

export const generate = action({
  args: { label: v.string() },
  handler: async (ctx, args): Promise<{ id: string; rawKey: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !(await ctx.runQuery(api.organizers.isCurrentUserOrganizer, {}))) {
      throw new Error("Forbidden: organizer access required.");
    }
    const label = args.label.trim();
    if (!label) throw new Error("Give this key a label.");
    if (label.length > 80) throw new Error("API key labels must be 80 characters or fewer.");
    const rawKey = `sk_live_${randomBytes(24).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const id = await ctx.runMutation(internal.apiKeys.storeInternal, {
      label,
      keyHash,
      keyPrefix: rawKey.slice(0, 16),
      createdByUserId: identity.subject,
    });
    return { id, rawKey };
  },
});
