"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { decryptSlackToken, safeSlackError } from "./slackSecurity";
import { postMessage } from "./slackClient";
import { proposalBlocks, resultBlocks, runUrl } from "./slackBlocks";

export const projectRunUpdate = internalAction({
  args: { runId: v.id("agent_runs") },
  handler: async (ctx, args) => {
    const state = await ctx.runQuery(internal.slackAgent.projectionContext, args);
    if (!state) return;
    const latest = state.events.at(-1);
    const proposal = state.proposals.find((item) => item.status === "pending" && item.kind === "create_tasks");
    const projectionKey = `${state.run.status}:${latest?._id ?? "none"}:${proposal?._id ?? "none"}`;
    if (state.thread.lastProjectionKey === projectionKey) return;
    const url = runUrl(state.event.slug, state.run._id);
    let text: string;
    let blocks;
    if (proposal?.tasks) {
      text = `Namos proposed ${proposal.tasks.length} task(s) for ${state.event.name}; approval is required.`;
      blocks = proposalBlocks({ eventName: state.event.name, proposalId: proposal._id, payloadHash: proposal.payloadHash, eventId: state.event._id, summary: proposal.summary, tasks: proposal.tasks, url });
    } else if (["needs_input", "completed", "failed"].includes(state.run.status)) {
      text = state.run.status === "needs_input" ? `Namos needs more information for ${state.event.name}.` : state.run.status === "failed" ? `Namos could not complete an Operations Agent run for ${state.event.name}.` : `Namos completed an Operations Agent run for ${state.event.name}.`;
      blocks = resultBlocks({ eventName: state.event.name, summary: state.run.finalSummary ?? state.run.error ?? latest?.message ?? "The run changed state.", status: state.run.status, url });
    } else return;
    try {
      await postMessage(decryptSlackToken(state.workspace.botTokenEnvelope), { channel: state.thread.slackChannelId, threadTs: state.thread.slackThreadTs, text, blocks, clientMsgId: `namos-${projectionKey}`.slice(0, 36) });
      await ctx.runMutation(internal.slackAgent.markProjected, { threadId: state.thread._id, projectionKey });
    } catch (error) {
      if (error instanceof Error && !safeSlackError(error).includes("temporarily")) await ctx.runMutation(internal.slackIntegrations.markWorkspaceError, { workspaceId: state.workspace._id, error: safeSlackError(error) });
    }
  },
});
