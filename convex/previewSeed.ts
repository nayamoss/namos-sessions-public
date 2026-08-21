import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

type SeedResult = { workspace: unknown; migration: { contactsCreated: number; speakersLinked: number; membershipsCreated: number } };

// CI-only deterministic seed. It is an internal action and also fails closed unless the
// isolated deployment explicitly opts in, so ordinary production clients cannot invoke it.
export const provision = internalAction({
  args: {
    workspaceId: v.string(), organizerUserId: v.string(), reviewerUserId: v.string(), speakerUserId: v.string(),
    organizerEmail: v.string(), reviewerEmail: v.string(), speakerEmail: v.string(), now: v.number(),
  },
  handler: async (ctx, args): Promise<SeedResult> => {
    if (process.env.PREVIEW_SEED_ENABLED !== "true") throw new Error("Preview seed is disabled.");
    const workspace = await ctx.runMutation(internal.demoWorkspaces.provision, args);
    let cursor: string | undefined;
    const migration = { contactsCreated: 0, speakersLinked: 0, membershipsCreated: 0 };
    do {
      const page = await ctx.runMutation(internal.migrations.backfillCrmContacts, { ...(cursor ? { cursor } : {}), batchSize: 100 });
      migration.contactsCreated += page.contactsCreated;
      migration.speakersLinked += page.speakersLinked;
      migration.membershipsCreated += page.membershipsCreated;
      cursor = page.done ? undefined : page.cursor;
      if (page.done) break;
    } while (cursor);
    return { workspace, migration };
  },
});
