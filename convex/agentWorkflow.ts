import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";

export const workflow = new WorkflowManager(components.workflow);

export const execute = workflow.define({
  args: { runId: v.id("agent_runs") },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    await step.runAction(internal.agentRuntime.executeSegment, args);
    return null;
  },
});
