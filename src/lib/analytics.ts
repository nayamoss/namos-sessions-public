export type AnalyticsConsent = "accepted" | "rejected" | "unknown";
export const ANALYTICS_CATALOG_VERSION = 1 as const;

type Surface = "app" | "auth" | "public" | "portal" | "help";
type ErrorCategory = "auth" | "conflict" | "network" | "rate_limit" | "validation" | "unknown";

export interface AnalyticsEventProperties {
  page_view: { route: string; surface: Surface };
  analytics_consent_updated: { consented: boolean };
  auth_completed: { role?: "organizer" | "reviewer" | "speaker"; signup_role?: "solo" | "team" };
  onboarding_completed: Record<string, never>;
  event_created: { event_status?: "draft" | "published" | "archived" };
  event_updated: { event_status?: "draft" | "published" | "archived" };
  event_switched: Record<string, never>;
  form_saved: { mode: "created" | "updated"; form_kind?: "abstract" | "session" | "contact" | "group" | "submission_task" };
  form_status_updated: { form_status: "draft" | "open" | "closed" };
  form_duplicated: Record<string, never>;
  submission_created: { source: "organizer" | "public"; submission_status?: "draft" | "pending" | "accepted" | "declined" };
  submission_status_updated: { submission_status: "draft" | "pending" | "in_review" | "accepted" | "declined" | "withdrawn" };
  public_submission_started: Record<string, never>;
  public_submission_completed: { participant_count: number };
  public_submission_failed: { error_category: ErrorCategory };
  speaker_created: Record<string, never>;
  speakers_imported: { imported_count: number; skipped_count: number };
  speaker_confirmation_updated: { confirmation_status: "awaiting" | "confirmed" | "declined" };
  speaker_profile_updated: { has_bio?: boolean; has_headshot?: boolean };
  sponsor_saved: { mode: "created" | "updated"; sponsor_status?: "prospect" | "confirmed" | "declined" };
  review_plan_saved: { mode: "created" | "updated"; round_count?: number; anonymized?: boolean };
  review_assignments_created: { created_count: number; skipped_count?: number };
  review_completed: { has_scorecard?: boolean };
  reviewer_reminders_sent: { sent_count: number; failed_count: number };
  agenda_session_saved: { mode: "created" | "updated"; published?: boolean };
  agenda_published: { published_count?: number };
  communication_template_saved: { mode: "created" | "updated"; communication_kind?: "submission_confirmation" | "acceptance" | "rejection" | "consolidated_decision" | "reminder" | "calendar_invite" | "custom" };
  communication_sent: { communication_kind: "decision" | "reminder" | "consolidated_decision"; sent_count: number; failed_count: number };
  communication_failed: { communication_kind: "decision" | "reminder" | "consolidated_decision"; error_category: ErrorCategory };
  task_created: { task_target?: "contact" | "group" | "submission" | "sponsor"; source?: "manual" | "auto" | "agent" };
  task_status_updated: { task_status: "pending" | "in_progress" | "completed" };
  integration_connected: { integration: "email" | "ai_provider" };
  integration_tested: { integration: "email"; outcome: "succeeded" | "failed" };
  integration_disconnected: { integration: "email" | "ai_provider" };
  api_key_created: { scope_count: number };
  api_key_revoked: Record<string, never>;
  embed_saved: { mode: "created" | "updated"; enabled?: boolean; embed_view?: "agenda" | "schedule_itinerary" | "schedule_grid" | "session_list" | "speaker_gallery" | "speaker_list" };
  embed_duplicated: Record<string, never>;
  embed_removed: Record<string, never>;
  portal_form_completed: Record<string, never>;
  availability_updated: { unavailable_count: number };
  help_opened: { destination: "api_docs" | "privacy" };
  cta_converted: { destination: "event_create" | "events" | "portal" | "sign_in" | "sign_up" };
  record_removed: { record_type: "agenda_session" | "form" | "sponsor" | "speaker_document" | "task_template" };
  workflow_failed: { workflow: "agenda" | "api_key" | "embed" | "event" | "form" | "integration" | "onboarding" | "review" | "speaker" | "sponsor" | "submission" | "task"; error_category: ErrorCategory };
}

export type AnalyticsEvent = keyof AnalyticsEventProperties;
type SafeProperties = Record<string, string | number | boolean | undefined>;
type PropertyKind = "boolean" | "count" | "route" | readonly string[];
type EventDefinition = { owner: "growth" | "product"; funnel: string; ga: boolean; properties: Record<string, PropertyKind> };

const enums = {
  surface: ["app", "auth", "public", "portal", "help"], role: ["organizer", "reviewer", "speaker"], signupRole: ["solo", "team"], eventStatus: ["draft", "published", "archived"],
  mode: ["created", "updated"], formKind: ["abstract", "session", "contact", "group", "submission_task"], formStatus: ["draft", "open", "closed"], submissionSource: ["organizer", "public"],
  submissionStatus: ["draft", "pending", "in_review", "accepted", "declined", "withdrawn"], error: ["auth", "conflict", "network", "rate_limit", "validation", "unknown"],
  confirmation: ["awaiting", "confirmed", "declined"], sponsorStatus: ["prospect", "confirmed", "declined"], templateKind: ["submission_confirmation", "acceptance", "rejection", "consolidated_decision", "reminder", "calendar_invite", "custom"],
  sendKind: ["decision", "reminder", "consolidated_decision"], taskTarget: ["contact", "group", "submission", "sponsor"], taskSource: ["manual", "auto", "agent"], taskStatus: ["pending", "in_progress", "completed"],
  integration: ["email", "ai_provider"], outcome: ["succeeded", "failed"], embedView: ["agenda", "schedule_itinerary", "schedule_grid", "session_list", "speaker_gallery", "speaker_list"],
  helpDestination: ["api_docs", "privacy"], ctaDestination: ["event_create", "events", "portal", "sign_in", "sign_up"], recordType: ["agenda_session", "form", "sponsor", "speaker_document", "task_template"], workflow: ["agenda", "api_key", "embed", "event", "form", "integration", "onboarding", "review", "speaker", "sponsor", "submission", "task"],
} as const;

const define = (owner: EventDefinition["owner"], funnel: string, ga: boolean, properties: EventDefinition["properties"] = {}): EventDefinition => ({ owner, funnel, ga, properties });

export const ANALYTICS_EVENT_CATALOG: Record<AnalyticsEvent, EventDefinition> = {
  page_view: define("growth", "acquisition", false, { route: "route", surface: enums.surface }), analytics_consent_updated: define("growth", "consent", false, { consented: "boolean" }),
  auth_completed: define("growth", "activation", true, { role: enums.role, signup_role: enums.signupRole }), onboarding_completed: define("growth", "activation", true),
  event_created: define("growth", "activation", true, { event_status: enums.eventStatus }), event_updated: define("product", "event_management", false, { event_status: enums.eventStatus }), event_switched: define("product", "event_management", false),
  form_saved: define("product", "cfp_setup", false, { mode: enums.mode, form_kind: enums.formKind }), form_status_updated: define("growth", "cfp_setup", true, { form_status: enums.formStatus }), form_duplicated: define("product", "cfp_setup", false),
  submission_created: define("product", "submission_pipeline", false, { source: enums.submissionSource, submission_status: enums.submissionStatus }), submission_status_updated: define("product", "submission_pipeline", false, { submission_status: enums.submissionStatus }),
  public_submission_started: define("growth", "public_submission", false), public_submission_completed: define("growth", "public_submission", true, { participant_count: "count" }), public_submission_failed: define("product", "public_submission", false, { error_category: enums.error }),
  speaker_created: define("product", "speaker_readiness", false), speakers_imported: define("product", "speaker_readiness", false, { imported_count: "count", skipped_count: "count" }), speaker_confirmation_updated: define("product", "speaker_readiness", false, { confirmation_status: enums.confirmation }), speaker_profile_updated: define("product", "speaker_readiness", false, { has_bio: "boolean", has_headshot: "boolean" }),
  sponsor_saved: define("product", "sponsor_management", false, { mode: enums.mode, sponsor_status: enums.sponsorStatus }), review_plan_saved: define("product", "review_completion", false, { mode: enums.mode, round_count: "count", anonymized: "boolean" }), review_assignments_created: define("product", "review_completion", false, { created_count: "count", skipped_count: "count" }), review_completed: define("growth", "review_completion", true, { has_scorecard: "boolean" }), reviewer_reminders_sent: define("product", "review_completion", false, { sent_count: "count", failed_count: "count" }),
  agenda_session_saved: define("product", "program_publishing", false, { mode: enums.mode, published: "boolean" }), agenda_published: define("growth", "program_publishing", true, { published_count: "count" }),
  communication_template_saved: define("product", "communications", false, { mode: enums.mode, communication_kind: enums.templateKind }), communication_sent: define("growth", "communications", true, { communication_kind: enums.sendKind, sent_count: "count", failed_count: "count" }), communication_failed: define("product", "communications", false, { communication_kind: enums.sendKind, error_category: enums.error }),
  task_created: define("product", "task_completion", false, { task_target: enums.taskTarget, source: enums.taskSource }), task_status_updated: define("product", "task_completion", false, { task_status: enums.taskStatus }),
  integration_connected: define("growth", "integration_activation", true, { integration: enums.integration }), integration_tested: define("product", "integration_activation", false, { integration: ["email"], outcome: enums.outcome }), integration_disconnected: define("product", "integration_activation", false, { integration: enums.integration }),
  api_key_created: define("growth", "developer_activation", true, { scope_count: "count" }), api_key_revoked: define("product", "developer_activation", false),
  embed_saved: define("product", "embed_management", false, { mode: enums.mode, enabled: "boolean", embed_view: enums.embedView }), embed_duplicated: define("product", "embed_management", false), embed_removed: define("product", "embed_management", false),
  portal_form_completed: define("growth", "speaker_readiness", true), availability_updated: define("product", "speaker_readiness", false, { unavailable_count: "count" }), help_opened: define("growth", "help_usage", false, { destination: enums.helpDestination }), cta_converted: define("growth", "navigation_conversion", false, { destination: enums.ctaDestination }),
  record_removed: define("product", "content_management", false, { record_type: enums.recordType }),
  workflow_failed: define("product", "workflow_reliability", false, { workflow: enums.workflow, error_category: enums.error }),
};

const consentKey = "namos-analytics-consent-v1";
const listeners = new Set<() => void>();
let initialized = false;
let gaLoaded = false;
let posthog: typeof import("posthog-js").default | undefined;
let posthogLoading: Promise<void> | undefined;

function isConfigured() {
  return Boolean(import.meta.env.VITE_GA_MEASUREMENT_ID || import.meta.env.VITE_POSTHOG_KEY) && (import.meta.env.PROD || import.meta.env.VITE_ENABLE_ANALYTICS === "true");
}

export function sanitizeAnalyticsProperties<E extends AnalyticsEvent>(event: E, properties: unknown): Partial<AnalyticsEventProperties[E]> {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return {};
  const allowed = ANALYTICS_EVENT_CATALOG[event].properties;
  const safe: SafeProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    const kind = allowed[key];
    if (!kind) continue;
    if (kind === "boolean" && typeof value === "boolean") safe[key] = value;
    else if (kind === "count" && typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000) safe[key] = value;
    else if (kind === "route" && typeof value === "string" && value.length <= 120 && value.startsWith("/") && !value.includes("?") && !value.includes("@") && /^\/[a-zA-Z0-9_:/.*-]*$/.test(value)) safe[key] = value;
    else if (Array.isArray(kind) && typeof value === "string" && (kind as readonly string[]).includes(value)) safe[key] = value;
  }
  return safe as Partial<AnalyticsEventProperties[E]>;
}

export function getAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return "unknown";
  try { const value = window.localStorage.getItem(consentKey); return value === "accepted" || value === "rejected" ? value : "unknown"; } catch { return "unknown"; }
}
export function subscribeToAnalyticsConsent(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function setAnalyticsConsent(consent: Exclude<AnalyticsConsent, "unknown">) {
  try { window.localStorage.setItem(consentKey, consent); } catch { /* The runtime still updates. */ }
  listeners.forEach((listener) => listener());
  if (consent === "accepted") void initializeAnalytics(); else resetAnalytics();
}

function loadGa() {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (!measurementId) return;
  (window as unknown as Record<string, boolean>)[`ga-disable-${measurementId}`] = false;
  if (gaLoaded) { window.gtag?.("consent", "update", { analytics_storage: "granted" }); return; }
  gaLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = (...args: unknown[]) => { window.dataLayer.push(args); };
  window.gtag("consent", "default", { analytics_storage: "granted" });
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false, anonymize_ip: true, allow_google_signals: false });
  const script = document.createElement("script"); script.async = true; script.dataset.namosAnalytics = "ga4"; script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`; document.head.appendChild(script);
}

async function initializeAnalytics() {
  if (!isConfigured() || getAnalyticsConsent() !== "accepted") return;
  loadGa();
  if (initialized) return posthogLoading;
  initialized = true;
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) return;
  posthogLoading = import("posthog-js").then(({ default: client }) => {
    if (getAnalyticsConsent() !== "accepted") return;
    posthog = client;
    client.init(key, { api_host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com", autocapture: false, capture_pageview: false, capture_pageleave: false, persistence: "localStorage", person_profiles: "identified_only", disable_session_recording: true, session_recording: { maskAllInputs: true, maskTextSelector: "*" } });
    client.opt_in_capturing();
  });
  return posthogLoading;
}

export function track<E extends AnalyticsEvent>(event: E, properties?: AnalyticsEventProperties[E]) {
  if (typeof window === "undefined" || getAnalyticsConsent() !== "accepted" || !isConfigured()) return;
  const safe = sanitizeAnalyticsProperties(event, properties ?? {});
  void initializeAnalytics().then(() => { if (getAnalyticsConsent() !== "accepted") return; if (ANALYTICS_EVENT_CATALOG[event].ga) window.gtag?.("event", event, safe); posthog?.capture(event, { ...safe, catalog_version: ANALYTICS_CATALOG_VERSION }); });
}

const staticRoutes = new Set(["/", "/events", "/onboarding", "/portal", "/portal/profile", "/portal/forms", "/portal/files", "/api-docs", "/sign-in", "/sign-up", "/settings/organization", "/dashboard", "/dashboard/speakers", "/program/forms", "/program/speakers", "/program/abstracts", "/program/evaluation", "/program/agenda", "/program/communications", "/program/availability", "/portals/tasks", "/portals/forms", "/settings/event", "/settings/library", "/settings/task-templates", "/settings/email", "/settings/api"]);
const eventRouteSuffixes = new Set(["", "/dashboard", "/analytics", "/program/forms", "/program/abstracts", "/program/speakers", "/program/sponsors", "/program/evaluation", "/program/agenda", "/program/readiness", "/program/agent", "/program/availability", "/program/communications", "/portals/forms", "/portals/tasks", "/settings/event", "/settings/team", "/settings/library", "/settings/task-templates", "/settings/integrations", "/settings/email", "/settings/api", "/settings/components", "/cms/embeds", "/cms/embeds/new"]);
export function normalizeAnalyticsPath(pathname: string) {
  const path = pathname.split("?")[0]?.replace(/\/+$/, "") || "/";
  const eventMatch = path.match(/^\/events\/[^/]+(\/.*)?$/);
  if (eventMatch) {
    const suffix = eventMatch[1] ?? "";
    if (eventRouteSuffixes.has(suffix)) return `/events/:eventSlug${suffix}`;
    if (/^\/program\/forms\/[^/]+\/edit$/.test(suffix)) return "/events/:eventSlug/program/forms/:formId/edit";
    if (/^\/program\/communications\/templates\/[^/]+\/edit$/.test(suffix)) return "/events/:eventSlug/program/communications/templates/:templateId/edit";
    if (/^\/cms\/embeds\/[^/]+$/.test(suffix)) return "/events/:eventSlug/cms/embeds/:embedId";
    return "/unknown";
  }
  if (/^\/submit\/[^/]+\/[^/]+$/.test(path)) return "/submit/:eventSlug/:formId";
  if (/^\/embed\/[^/]+$/.test(path)) return "/embed/:embedId";
  if (/^\/e\/[^/]+$/.test(path)) return "/e/:eventSlug";
  if (/^\/e\/[^/]+\/[^/]+$/.test(path)) return "/e/:eventSlug/:feed";
  if (/^\/sign-(?:in|up)\//.test(path)) return path.startsWith("/sign-in") ? "/sign-in/*" : "/sign-up/*";
  if (/^\/portal\//.test(path) && !staticRoutes.has(path)) return "/portal/:resource";
  return staticRoutes.has(path) ? path : "/unknown";
}
function routeSurface(path: string): Surface { if (path.startsWith("/submit/") || path.startsWith("/e/")) return "public"; if (path.startsWith("/sign-")) return "auth"; if (path.startsWith("/portal")) return "portal"; if (path === "/api-docs") return "help"; return "app"; }
export function trackPageView(pathname: string) {
  if (pathname.startsWith("/embed/")) return;
  const route = normalizeAnalyticsPath(pathname); track("page_view", { route, surface: routeSurface(route) });
  if (getAnalyticsConsent() === "accepted" && isConfigured()) void initializeAnalytics().then(() => window.gtag?.("event", "page_view", { page_path: route }));
}

export function setAnalyticsIdentity(userId: string, properties?: { role?: "organizer" | "reviewer" | "speaker"; signupRole?: "solo" | "team" }) {
  if (getAnalyticsConsent() !== "accepted" || !/^[\w|-]{3,128}$/.test(userId)) return;
  void initializeAnalytics().then(() => {
    if (getAnalyticsConsent() !== "accepted") return;
    posthog?.identify(userId, { ...(properties?.role ? { role: properties.role } : {}), ...(properties?.signupRole ? { signup_role: properties.signupRole } : {}) });
    try { const marker = "namos-analytics-auth-captured-v1"; if (window.sessionStorage.getItem(marker) !== "true") { window.sessionStorage.setItem(marker, "true"); track("auth_completed", { ...(properties?.role ? { role: properties.role } : {}), ...(properties?.signupRole ? { signup_role: properties.signupRole } : {}) }); } } catch { /* Identity remains valid without session storage. */ }
  });
}

export function isReplayAllowed(pathname: string) { return /^\/submit\/[^/]+\/[^/]+\/?$/.test(pathname) || /^\/e\/[^/]+(?:\/[^/]+)?\/?$/.test(pathname); }
export function updateReplay(pathname: string) { if (getAnalyticsConsent() !== "accepted") return; void initializeAnalytics().then(() => { if (getAnalyticsConsent() !== "accepted") return; if (isReplayAllowed(pathname)) posthog?.startSessionRecording(); else posthog?.stopSessionRecording(); }); }
export function analyticsErrorCategory(error: unknown): ErrorCategory { const message = error instanceof Error ? error.message.toLowerCase() : ""; if (/unauth|forbidden|permission|sign.?in/.test(message)) return "auth"; if (/conflict|already exists|duplicate/.test(message)) return "conflict"; if (/rate.?limit|too many/.test(message)) return "rate_limit"; if (/invalid|required|closed|limit reached|verification/.test(message)) return "validation"; if (/network|fetch|unavailable|timeout|offline/.test(message)) return "network"; return "unknown"; }

export function resetAnalytics() {
  if (typeof window === "undefined") return;
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (measurementId) { (window as unknown as Record<string, boolean>)[`ga-disable-${measurementId}`] = true; window.gtag?.("consent", "update", { analytics_storage: "denied" }); const cookieName = `_ga_${measurementId.replace(/^G-/, "").replace(/-/g, "_")}`; for (const name of ["_ga", cookieName]) document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`; }
  posthog?.stopSessionRecording(); posthog?.opt_out_capturing(); posthog?.reset(); initialized = false; posthog = undefined; posthogLoading = undefined;
  try { window.sessionStorage.removeItem("namos-analytics-auth-captured-v1"); } catch { /* no-op */ }
}
export function __resetAnalyticsForTests() { initialized = false; gaLoaded = false; posthog = undefined; posthogLoading = undefined; listeners.clear(); }

declare global { interface Window { dataLayer: unknown[][]; gtag?: (...args: unknown[]) => void; } }
