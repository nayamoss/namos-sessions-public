export type ProofStatus = "PASS" | "FAIL" | "NOT RUN";
export type DemoRole = "organizer" | "reviewer" | "speaker";

export type ProofRequirement = {
  id: string;
  requirement: string;
  explanation: string;
  actionLabel: string;
  proofRoute: string;
  requiredRole?: DemoRole;
  testName?: string;
  status: ProofStatus;
  note?: string;
};

export type ProofMetadata = { commit?: string; verifiedAt?: string; summary?: string };
export type DemoWorkspaceContext = { eventSlug: string; activeRole: DemoRole };
export type ProofDestination = { label: string; route: string; createsContext: boolean };
export type WalkthroughMedia = {
  videoUrl?: string;
  posterUrl?: string;
  captionsUrl?: string;
  transcriptUrl?: string;
  isPublished: boolean;
  missing: Array<"video" | "poster" | "captions" | "transcript">;
};

const requirements: ReadonlyArray<Omit<ProofRequirement, "status" | "testName" | "note">> = [
  { id: "role-entry", requirement: "Enter instantly as Organizer, Reviewer, or Speaker", explanation: "Start an isolated event without creating an account, then move between all three roles.", actionLabel: "Choose a role", proofRoute: "/demo/start#roles" },
  { id: "control-room", requirement: "See the real work waiting in the Program Control Room", explanation: "Inspect decisions, reviews, communications, speaker tasks, scheduling conflicts, and publication blockers. Every item opens the record that resolves it.", actionLabel: "Open Control Room", proofRoute: "/demo?proof=control-room", requiredRole: "organizer" },
  { id: "walkthrough", requirement: "Complete the connected five-minute workflow", explanation: "Submit, review, accept, notify, finish speaker work, schedule, resolve a conflict, and publish against one event.", actionLabel: "Start the walkthrough", proofRoute: "/demo?proof=walkthrough", requiredRole: "organizer" },
  { id: "operations-agent", requirement: "Approve concrete Operations Agent actions before they run", explanation: "The agent inspects event state, proposes specific work, and waits for confirmation before changing anything.", actionLabel: "Open Operations Agent", proofRoute: "/demo?proof=operations-agent", requiredRole: "organizer" },
  { id: "resources", requirement: "Read the published speaker Resources/Wiki", explanation: "The speaker portal renders the seeded handbook from sanitized published HTML.", actionLabel: "Open speaker resources", proofRoute: "/demo?proof=resources", requiredRole: "speaker" },
  { id: "captured-delivery", requirement: "Inspect acceptance email and calendar delivery safely", explanation: "Demo messages and calendar invitations are captured in the workspace inbox and never sent to external recipients.", actionLabel: "Open demo inbox", proofRoute: "/demo?proof=inbox", requiredRole: "organizer" },
  { id: "publication", requirement: "Inspect the published agenda and speaker gallery", explanation: "The final public output is connected to the same event state used throughout the walkthrough.", actionLabel: "Open published program", proofRoute: "/demo?proof=publication", requiredRole: "organizer" },
  { id: "workspace-reset", requirement: "Reset the isolated workspace to its seeded state", explanation: "Explore freely, then remove walkthrough changes and restore the original event for the next run.", actionLabel: "Open reset controls", proofRoute: "/demo?proof=reset", requiredRole: "organizer" },
];

type SuppliedResult = Partial<Pick<ProofRequirement, "status" | "testName" | "note" | "proofRoute">> & { id?: string };

function parseResults(raw: string | undefined): Map<string, SuppliedResult> {
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Map();
    return new Map(parsed
      .filter((item): item is SuppliedResult & { id: string } => Boolean(item && typeof item === "object" && typeof (item as SuppliedResult).id === "string"))
      .map((item) => [item.id, item]));
  } catch {
    return new Map();
  }
}

function isSafePublicUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const candidate = value.trim();
  if (candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.includes("\\")) {
    return !Array.from(candidate).some((character) => character.charCodeAt(0) < 32);
  }
  try {
    return new URL(candidate).protocol === "https:";
  } catch {
    return false;
  }
}

export function buildProofRequirements(raw = import.meta.env.VITE_DEMO_PROOF_RESULTS): ProofRequirement[] {
  const supplied = parseResults(raw);
  return requirements.map((definition) => {
    const result = supplied.get(definition.id);
    const proofRoute = isSafePublicUrl(result?.proofRoute) && result.proofRoute.startsWith("/") ? result.proofRoute : definition.proofRoute;
    const testName = typeof result?.testName === "string" && result.testName.trim() ? result.testName.trim() : undefined;
    const requested = result?.status;
    const status: ProofStatus = requested === "FAIL" || requested === "NOT RUN" ? requested : requested === "PASS" && testName && proofRoute ? "PASS" : "NOT RUN";
    const note = typeof result?.note === "string" && result.note.trim() ? result.note.trim() : undefined;
    return { ...definition, proofRoute, testName, status, note };
  });
}

export function resolveProofDestination(item: ProofRequirement, workspace: DemoWorkspaceContext | null): ProofDestination {
  if (item.id === "role-entry") return { label: item.actionLabel, route: "/demo/start#roles", createsContext: false };
  if (!workspace || (item.requiredRole && item.requiredRole !== workspace.activeRole)) {
    return { label: "Start a demo to verify", route: item.proofRoute, createsContext: true };
  }
  const organizerBase = `/events/${workspace.eventSlug}`;
  const routeById: Record<string, string> = {
    "control-room": `${organizerBase}/dashboard`,
    walkthrough: `${organizerBase}/dashboard`,
    "operations-agent": `${organizerBase}/program/agent`,
    resources: "/portal/resources",
    "captured-delivery": "/demo/inbox",
    publication: `/e/${workspace.eventSlug}`,
    "workspace-reset": `${organizerBase}/dashboard`,
  };
  return { label: item.actionLabel, route: routeById[item.id] ?? item.proofRoute, createsContext: false };
}

export function readWalkthroughMedia(input: { videoUrl?: string; posterUrl?: string; captionsUrl?: string; transcriptUrl?: string } = {
  videoUrl: import.meta.env.VITE_DEMO_VIDEO_URL,
  posterUrl: import.meta.env.VITE_DEMO_VIDEO_POSTER_URL,
  captionsUrl: import.meta.env.VITE_DEMO_VIDEO_CAPTIONS_URL,
  transcriptUrl: import.meta.env.VITE_DEMO_VIDEO_TRANSCRIPT_URL,
}): WalkthroughMedia {
  const videoUrl = isSafePublicUrl(input.videoUrl) ? input.videoUrl.trim() : undefined;
  const posterUrl = isSafePublicUrl(input.posterUrl) ? input.posterUrl.trim() : undefined;
  const captionsUrl = isSafePublicUrl(input.captionsUrl) ? input.captionsUrl.trim() : undefined;
  const transcriptUrl = isSafePublicUrl(input.transcriptUrl) ? input.transcriptUrl.trim() : undefined;
  const missing: WalkthroughMedia["missing"] = [];
  if (!videoUrl) missing.push("video");
  if (!posterUrl) missing.push("poster");
  if (!captionsUrl) missing.push("captions");
  if (!transcriptUrl) missing.push("transcript");
  return { videoUrl, posterUrl, captionsUrl, transcriptUrl, isPublished: missing.length === 0, missing };
}

export function readProofMetadata(): ProofMetadata {
  return {
    commit: import.meta.env.VITE_DEMO_DEPLOY_COMMIT || undefined,
    verifiedAt: import.meta.env.VITE_DEMO_VERIFIED_AT || undefined,
    summary: import.meta.env.VITE_DEMO_TEST_SUMMARY || undefined,
  };
}
