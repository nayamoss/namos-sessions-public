"use node";

import type { SlackBlock } from "./slackClient";

export function escapeSlack(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function runUrl(eventSlug: string, runId: string) {
  const origin = process.env.PUBLIC_APP_ORIGIN?.replace(/\/$/, "");
  if (!origin) throw new Error("PUBLIC_APP_ORIGIN is not configured.");
  return `${origin}/events/${encodeURIComponent(eventSlug)}/operations-agent?run=${encodeURIComponent(runId)}`;
}

function openButton(url: string): SlackBlock {
  return { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in Namos" }, url }] };
}

export function acknowledgementBlocks(input: { eventName: string; objective: string; url: string }): SlackBlock[] {
  return [
    { type: "header", text: { type: "plain_text", text: "Namos Operations" } },
    { type: "section", text: { type: "mrkdwn", text: escapeSlack(input.objective).slice(0, 500) } },
    { type: "context", elements: [{ type: "mrkdwn", text: `${escapeSlack(input.eventName)} · Running` }] },
    openButton(input.url),
  ];
}

export function resultBlocks(input: { eventName: string; summary: string; status: string; url: string }): SlackBlock[] {
  const heading = input.status === "needs_input" ? "Namos needs more information" : input.status === "failed" ? "Namos could not complete this run" : "Namos Operations";
  return [
    { type: "header", text: { type: "plain_text", text: heading } },
    { type: "section", text: { type: "mrkdwn", text: escapeSlack(input.summary).slice(0, 2800) } },
    ...(input.status === "needs_input" ? [{ type: "context", elements: [{ type: "mrkdwn", text: `Reply in this thread to continue · ${escapeSlack(input.eventName)}` }] }] : [{ type: "context", elements: [{ type: "mrkdwn", text: `${escapeSlack(input.eventName)} · ${escapeSlack(input.status.replace(/_/g, " "))}` }] }]),
    openButton(input.url),
  ];
}

export function proposalBlocks(input: { eventName: string; proposalId: string; payloadHash: string; eventId: string; summary: string; tasks: Array<{ title: string; targetType: string; dueDate?: number; reason: string }>; url: string }): SlackBlock[] {
  const visible = input.tasks.slice(0, 10);
  const value = Buffer.from(JSON.stringify({ proposalId: input.proposalId, expectedPayloadHash: input.payloadHash, eventId: input.eventId })).toString("base64url");
  return [
    { type: "header", text: { type: "plain_text", text: "Task proposal" } },
    { type: "section", text: { type: "mrkdwn", text: escapeSlack(input.summary).slice(0, 1000) } },
    ...visible.map((task) => ({ type: "section", text: { type: "mrkdwn", text: `*${escapeSlack(task.title)}*\nTarget: ${escapeSlack(task.targetType)}${task.dueDate ? ` · Due: ${new Date(task.dueDate).toISOString().slice(0, 10)}` : ""}\n${escapeSlack(task.reason).slice(0, 500)}` } })),
    ...(input.tasks.length > 10 ? [{ type: "context", elements: [{ type: "mrkdwn", text: `Open in Namos to review ${input.tasks.length - 10} more.` }] }] : []),
    { type: "actions", elements: [
      { type: "button", style: "primary", action_id: "namos_proposal_approve", text: { type: "plain_text", text: "Approve & create" }, value },
      { type: "button", style: "danger", action_id: "namos_proposal_reject", text: { type: "plain_text", text: "Reject" }, value },
      { type: "button", text: { type: "plain_text", text: "Open in Namos" }, url: input.url },
    ] },
  ];
}

export function decidedProposalBlocks(input: { text: string; slackUserId: string; url: string }): SlackBlock[] {
  return [
    { type: "section", text: { type: "mrkdwn", text: escapeSlack(input.text) } },
    { type: "context", elements: [{ type: "mrkdwn", text: `${escapeSlack(input.text)} by <@${input.slackUserId}>` }] },
    openButton(input.url),
  ];
}
