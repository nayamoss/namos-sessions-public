"use node";

import { createClerkClient } from "@clerk/backend";

export type ManagedAllowance = { planSlug: string; runLimit: number; tokenLimit: number; reserveTokens: number };

function planMap() {
  const raw = process.env.CLERK_AGENT_PLAN_ALLOWANCES;
  if (!raw) throw new Error("Namos-managed AI billing is not configured.");
  const parsed = JSON.parse(raw) as Record<string, { runs?: unknown; tokens?: unknown; perRunTokens?: unknown }>;
  return Object.fromEntries(Object.entries(parsed).map(([slug, value]) => {
    const runs = Number(value.runs);
    const tokens = Number(value.tokens);
    const perRunTokens = Number(value.perRunTokens ?? tokens);
    if (!Number.isSafeInteger(runs) || runs < 1 || !Number.isSafeInteger(tokens) || tokens < 1 || !Number.isSafeInteger(perRunTokens) || perRunTokens < 1) throw new Error(`Invalid managed AI allowance for Clerk plan ${slug}.`);
    return [slug, { runs, tokens, perRunTokens }];
  }));
}

export async function resolveManagedAllowance(billingOwnerUserId: string): Promise<ManagedAllowance> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("Namos-managed AI billing is not configured.");
  const clerk = createClerkClient({ secretKey });
  const user = await clerk.users.getUser(billingOwnerUserId);
  if (user.privateMetadata.namosDemoRole === "organizer" && typeof user.privateMetadata.namosDemoWorkspaceId === "string") {
    return { planSlug: "demo", runLimit: 3, tokenLimit: 30_000, reserveTokens: 10_000 };
  }
  const subscription = await clerk.billing.getUserBillingSubscription(billingOwnerUserId);
  const item = subscription.subscriptionItems.find((candidate) => candidate.status === "active" && candidate.plan);
  const plan = item?.plan;
  if (!plan) throw new Error("The event billing owner does not have an active Namos AI plan.");
  const requiredFeature = process.env.CLERK_AGENT_REQUIRED_FEATURE ?? "agent-managed-ai";
  if (!plan.features.some((feature) => feature.slug === requiredFeature)) throw new Error("The event billing owner’s Namos plan does not include managed AI.");
  const allowance = planMap()[plan.slug];
  if (!allowance) throw new Error("This Namos plan has no managed AI allowance configured.");
  return { planSlug: plan.slug, runLimit: allowance.runs, tokenLimit: allowance.tokens, reserveTokens: Math.min(allowance.tokens, allowance.perRunTokens) };
}
