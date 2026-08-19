export type ProofStatus = "PASS" | "FAIL" | "NOT RUN";

export type ProofRequirement = {
  id: string;
  requirement: string;
  proofRoute: string;
  testName?: string;
  status: ProofStatus;
  note?: string;
};

export type ProofMetadata = {
  commit?: string;
  verifiedAt?: string;
  summary?: string;
};

const requirements = [
  ["role-entry", "No-login Organizer, Reviewer, and Speaker demo entry", "/demo#roles"],
  ["control-room", "Seeded Program Control Room with exact resolution links", "/demo?proof=control-room"],
  ["walkthrough", "Complete state-driven five-minute workflow", "/demo?proof=walkthrough"],
  ["operations-agent", "Operations Agent proposes concrete, confirm-before-write actions", "/demo?proof=operations-agent"],
  ["resources", "Speaker Resources/Wiki renders sanitized published HTML", "/demo?proof=resources"],
  ["captured-delivery", "Acceptance message and calendar invite are captured without external delivery", "/demo?proof=inbox"],
  ["publication", "Published agenda and speaker gallery are directly inspectable", "/demo?proof=publication"],
  ["workspace-reset", "Seeded workspace is isolated and resettable", "/demo?proof=reset"],
] as const;

type SuppliedResult = Partial<Pick<ProofRequirement, "status" | "testName" | "note" | "proofRoute">> & { id?: string };

function parseResults(raw: string | undefined): Map<string, SuppliedResult> {
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Map();
    return new Map(parsed.filter((item): item is SuppliedResult & { id: string } => Boolean(item && typeof item === "object" && typeof (item as SuppliedResult).id === "string")).map((item) => [item.id, item]));
  } catch {
    return new Map();
  }
}

export function buildProofRequirements(raw = import.meta.env.VITE_DEMO_PROOF_RESULTS): ProofRequirement[] {
  const supplied = parseResults(raw);
  return requirements.map(([id, requirement, defaultRoute]) => {
    const result = supplied.get(id);
    const candidate = result?.proofRoute;
    const safeRoute = typeof candidate === "string"
      && candidate.startsWith("/")
      && !candidate.startsWith("//")
      && !candidate.includes("\\")
      && !Array.from(candidate).some((character) => character.charCodeAt(0) < 32);
    const proofRoute = safeRoute ? result.proofRoute as string : defaultRoute;
    const testName = typeof result?.testName === "string" && result.testName.trim() ? result.testName.trim() : undefined;
    const requested = result?.status;
    const status: ProofStatus = requested === "FAIL" || requested === "NOT RUN"
      ? requested
      : requested === "PASS" && testName && proofRoute
        ? "PASS"
        : "NOT RUN";
    return { id, requirement, proofRoute, testName, status, note: result?.note };
  });
}

export function readProofMetadata(): ProofMetadata {
  return {
    commit: import.meta.env.VITE_DEMO_DEPLOY_COMMIT || undefined,
    verifiedAt: import.meta.env.VITE_DEMO_VERIFIED_AT || undefined,
    summary: import.meta.env.VITE_DEMO_TEST_SUMMARY || undefined,
  };
}
