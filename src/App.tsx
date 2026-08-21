import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  SignIn,
  SignUp,
  useAuth,
} from "@clerk/clerk-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AppLayout } from "@/components/AppLayout";
import { EventProvider, getLastVisitedEventSlug } from "@/components/EventContext";
import { PublicLayout } from "@/components/PublicLayout";
import { AuthSplitLayout } from "@/pages/public/AuthSplitLayout";
import { RepoProvider } from "@/data/provider";
import { useRepo } from "@/data/repo";
import { resolveOnboardingStatus } from "@/lib/onboarding-status";
import { AnalyticsRuntime } from "@/components/AnalyticsConsent";
import { track } from "@/lib/analytics";
import { DemoWorkspaceBar } from "@/components/demo/DemoWorkspaceBar";
import type { Event } from "@/data/types";
const EventDetails = lazy(() => import("@/pages/settings/EventDetails"));
const EventTeam = lazy(() => import("@/pages/settings/EventTeam"));
const Library = lazy(() => import("@/pages/settings/Library"));
const TaskTemplates = lazy(() => import("@/pages/settings/TaskTemplates"));
const Integrations = lazy(() => import("@/pages/settings/Integrations"));
const AgentUsage = lazy(() => import("@/pages/settings/AgentUsage"));
const ApiKeys = lazy(() => import("@/pages/settings/ApiKeys"));
const ActivityLog = lazy(() => import("@/pages/settings/ActivityLog"));
const ReadinessSettings = lazy(() => import("@/pages/settings/ReadinessSettings"));
const SubmissionForms = lazy(() => import("@/pages/program/SubmissionForms"));
const Abstracts = lazy(() => import("@/pages/program/Abstracts"));
const Agenda = lazy(() => import("@/pages/program/Agenda"));
const Recordings = lazy(() => import("@/pages/program/Recordings"));
const Readiness = lazy(() => import("@/pages/program/Readiness"));
const AgentOperations = lazy(() => import("@/pages/program/AgentOperations"));
const Evaluation = lazy(() => import("@/pages/program/Evaluation"));
const Availability = lazy(() => import("@/pages/program/Availability"));
const SubmissionFormBuilder = lazy(
  () => import("@/pages/program/SubmissionFormBuilder"),
);
const PortalForms = lazy(() => import("@/pages/portal/PortalForms"));
const TasksAdmin = lazy(() => import("@/pages/portal/TasksAdmin"));
const TaskEditorPage = lazy(() => import("@/pages/portal/TaskEditorPage"));
const PortalResourcesAdmin = lazy(() => import("@/pages/portal/PortalResourcesAdmin"));
const Communications = lazy(() => import("@/pages/program/Communications"));
const CommTemplateEditor = lazy(
  () => import("@/pages/program/CommTemplateEditor"),
);
const Speakers = lazy(() => import("@/pages/program/Speakers"));
const Contacts = lazy(() => import("@/pages/program/Contacts"));
const Sponsors = lazy(() => import("@/pages/program/Sponsors"));
const DashboardHome = lazy(() => import("@/pages/dashboard/DashboardHome"));
const EventAnalytics = lazy(() => import("@/pages/dashboard/EventAnalytics"));
const SubmissionPage = lazy(() => import("@/pages/public/SubmissionPage"));
const PortalHome = lazy(() => import("@/pages/portal/PortalHome"));
const EmbedPage = lazy(() => import("@/pages/public/EmbedPage"));
const AttendeeSite = lazy(() => import("@/pages/public/AttendeeSite"));
const PublicEmbedPage = lazy(() => import("@/pages/public/PublicEmbedPage"));
const EmbedsListPage = lazy(() => import("@/pages/cms/EmbedsListPage"));
const FeedsListPage = lazy(() => import("@/pages/cms/FeedsListPage"));
const EmbedEditorPage = lazy(() => import("@/pages/cms/EmbedEditorPage"));
const OnboardingWizard = lazy(
  () => import("@/pages/onboarding/OnboardingWizard"),
);
const ApiDocs = lazy(() => import("@/pages/public/ApiDocs"));
const EventsLanding = lazy(() => import("@/pages/events/EventsLanding"));
const ComponentShowcase = lazy(() => import("@/pages/settings/ComponentShowcase"));
const Updates = lazy(() => import("@/pages/Updates"));
const DemoLandingPage = lazy(() => import("@/pages/public/DemoLandingPage"));
const DemoProofPage = lazy(() => import("@/pages/public/DemoProofPage"));
const DemoInboxPage = lazy(() => import("@/pages/public/DemoInboxPage"));

function FeaturePlaceholder({ title }: { title: string }) {
  return (
    <AppLayout title={title}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This workspace is ready for its feature implementation.
        </p>
      </div>
    </AppLayout>
  );
}
function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  return <AppLayout title={title}>{children}</AppLayout>;
}
function LegacyEmbedRedirect() {
  const { eventSlug, embedId } = useParams();
  return <Navigate to={`/events/${eventSlug}/cms/embeds/${embedId}/edit`} replace />;
}

function SubmissionFormCreateRoute() {
  const [params] = useSearchParams();
  return params.get("blank") === "1" ? <SubmissionFormBuilder /> : <SubmissionForms createMode />;
}
function PublicLoading({
  children,
  width = "wide",
}: {
  children: string;
  width?: "form" | "submission" | "wide";
}) {
  return (
    <PublicLayout width={width}>
      <p className="text-sm text-muted-foreground">{children}</p>
    </PublicLayout>
  );
}

// Gates its nested routes behind a Clerk session: every organizer/admin route (dashboard,
// settings, portals-admin, program/*) and the speaker-facing portal itself. The public
// submission and embed routes below must never be wrapped in it.
const AUTH_RETURN_TO_KEY = "namos-auth-return-to";

export function resolveAuthReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/sign-in") || value.startsWith("/sign-up") || value.startsWith("/auth/complete")) return "/";
  return value;
}

function SignedOutRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    try {
      sessionStorage.setItem(AUTH_RETURN_TO_KEY, resolveAuthReturnTo(returnTo));
    } catch {
      // Storage is optional; the completion route safely falls back to the app root.
    }
    navigate("/sign-in", { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);
  return <p className="p-6 text-sm text-muted-foreground">Opening sign in…</p>;
}

function RequireAuth() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!isSignedIn) return <SignedOutRedirect />;
  return <Outlet />;
}

function AuthComplete() {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(AUTH_RETURN_TO_KEY);
    sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
  } catch {
    // Private browsing can deny storage access; returning to / remains safe.
  }
  return <Navigate to={resolveAuthReturnTo(stored)} replace />;
}

function RequireOnboarding() {
  const repo = useRepo();
  const location = useLocation();
  const [status, setStatus] = useState<
    "loading" | "incomplete" | "complete" | "unavailable"
  >("loading");
  const check = useCallback(() => {
    setStatus("loading");
    return Promise.all([repo.organizers.getMine(), repo.events.listMine()])
      .then(([organizer, events]) =>
        resolveOnboardingStatus(organizer, events.length),
      )
      .catch((cause) => {
        // A failed lookup means we could not reach the backend or the session was
        // rejected — it says nothing about whether this person has onboarded.
        // Treating it as "incomplete" used to redirect fully signed-in organizers
        // and speakers into the setup wizard, where the same failure resurfaced as
        // an auth error. Surface the failure instead of guessing (see #223).
        console.error(cause);
        return "unavailable" as const;
      });
  }, [repo]);
  useEffect(() => {
    let cancelled = false;
    void check().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [check, location.pathname]);
  if (status === "loading")
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (status === "unavailable")
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm font-medium">We couldn&apos;t load your workspace.</p>
        <p className="text-sm text-muted-foreground">
          You are still signed in. This is a connection problem, not a problem with
          your account.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void check().then(setStatus);
          }}
        >
          Try again
        </Button>
      </div>
    );
  if (status === "incomplete") return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

// A signed-out visitor hitting any gated route lands on a clean /sign-in URL, where Clerk's only route to
// creating an account is a small grey line inside the card. Organizers arriving from the
// marketing site read that as "there is no way in" and leave, so each auth screen carries an
// explicit, full-width link to the other one. The intended destination lives in session storage
// so Clerk's internal steps never expose or repeatedly rewrite a nested `redirect_url` query.
function AuthAltAction({
  to,
  prompt,
  action,
}: {
  to: string;
  prompt: string;
  action: string;
}) {
  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <p className="text-sm text-[#657086]">{prompt}</p>
      <Link
        to={to}
        onClick={() => track("cta_converted", { destination: to === "/sign-up" ? "sign_up" : "sign_in" })}
        className="w-full rounded-xl bg-[#0066FF] px-4 py-3.5 text-center text-base font-semibold text-white hover:bg-[#005CE6]"
      >
        {action}
      </Link>
    </div>
  );
}

function LegacySpeakersRedirect() {
  return <Navigate to="/events" replace />;
}

// Exported for a direct unit test — signing in should drop you where you left
// off: the last event you actually visited, not always the bare list, as long
// as that event still exists and you still have access to it. Falls back to
// the old "only one event, skip the list" shortcut, then the list itself.
export function resolveEventsEntryDestination(events: Pick<Event, "slug">[], lastVisitedSlug: string | null): string {
  const lastVisited = lastVisitedSlug && events.some((event) => event.slug === lastVisitedSlug) ? lastVisitedSlug : undefined;
  if (lastVisited) return `/events/${lastVisited}/dashboard`;
  if (events.length === 1) return `/events/${events[0].slug}/dashboard`;
  return "/events";
}

function EventsEntry() {
  const repo = useRepo();
  const [destination, setDestination] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    void repo.events
      .listMine()
      .then((events) => {
        if (!cancelled) setDestination(resolveEventsEntryDestination(events, getLastVisitedEventSlug()));
      })
      .catch(() => {
        if (!cancelled) setDestination("/events");
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);
  return destination ? (
    <Navigate to={destination} replace />
  ) : (
    <p className="p-6 text-sm text-muted-foreground">Loading events…</p>
  );
}

function LegacySettingsEntry() {
  const repo = useRepo();
  const navigate = useNavigate();
  const { tab = "event" } = useParams();
  useEffect(() => {
    let cancelled = false;
    void repo.events.listMine().then((events) => {
      if (!cancelled) navigate(events[0] ? `/events/${events[0].slug}/settings/${tab}` : "/events", { replace: true });
    }).catch(() => { if (!cancelled) navigate("/events", { replace: true }); });
    return () => { cancelled = true; };
  }, [navigate, repo, tab]);
  return <p className="p-6 text-sm text-muted-foreground">Loading settings…</p>;
}

export default function App() {
  return (
    <RepoProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AnalyticsRuntime />
          <DemoWorkspaceBar />
          <Suspense
            fallback={
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            }
          >
            <Routes>
              {/* The production Worker owns /demo; this keeps local SPA navigation canonical. */}
              <Route path="/demo" element={<Navigate to="/demo/start" replace />} />
              <Route path="/demo/start" element={<DemoLandingPage />} />
              <Route path="/demo/proof" element={<DemoProofPage />} />
              <Route path="/demo/inbox" element={<DemoInboxPage />} />
              <Route path="/updates" element={<Updates />} />
              <Route path="/auth/complete" element={<AuthComplete />} />
              <Route
                path="/sign-in/*"
                element={
                  <AuthSplitLayout>
                    <SignIn
                      routing="path"
                      path="/sign-in"
                      signUpUrl="/sign-up"
                      forceRedirectUrl="/auth/complete"
                      // Clerk's own footer prompt is suppressed in favour of the larger
                      // AuthAltAction below; showing both put the same link on screen twice.
                      appearance={{ elements: { footerAction: { display: "none" } } }}
                    />
                    <AuthAltAction
                      to="/sign-up"
                      prompt="New to Namos Sessions?"
                      action="Sign up"
                    />
                  </AuthSplitLayout>
                }
              />
              <Route
                path="/sign-up/*"
                element={
                  <AuthSplitLayout>
                    <SignUp
                      routing="path"
                      path="/sign-up"
                      signInUrl="/sign-in"
                      forceRedirectUrl="/auth/complete"
                      appearance={{ elements: { footerAction: { display: "none" } } }}
                    />
                    <AuthAltAction
                      to="/sign-in"
                      prompt="Already have an account?"
                      action="Sign in"
                    />
                  </AuthSplitLayout>
                }
              />
              <Route element={<RequireAuth />}>
                <Route path="/onboarding" element={<OnboardingWizard />} />
                {/* Speaker-facing portal, not an organizer surface — a signed-in speaker has no
        `organizers` row and must never be redirected into organizer onboarding. */}
                <Route
                  path="/portal/*"
                  element={
                    <Suspense
                      fallback={
                        <p className="p-6 text-sm text-muted-foreground">
                          Loading portal…
                        </p>
                      }
                    >
                      <PortalHome />
                    </Suspense>
                  }
                />
                <Route element={<RequireOnboarding />}>
                  <Route path="/" element={<EventsEntry />} />
                  <Route path="/events" element={<EventsLanding />} />
                  <Route path="/events/new" element={<EventsLanding />} />
                  <Route
                    path="/settings/organization"
                    element={<EventsLanding />}
                  />
                  <Route path="/settings/:tab" element={<LegacySettingsEntry />} />
                  <Route
                    path="/dashboard"
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/dashboard/speakers"
                    element={<LegacySpeakersRedirect />}
                  />
                  <Route
                    path="/program/*"
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/program/forms"
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/program/speakers"
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/program/abstracts"
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/program/evaluation"
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/program/agenda"
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/program/communications"
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/program/availability"
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/portals/*"
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/portals/tasks"
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/portals/forms"
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/settings/event"
                    element={<LegacySettingsEntry />}
                  />
                  <Route
                    path="/settings/library"
                    element={<LegacySettingsEntry />}
                  />
                  <Route
                    path="/settings/task-templates"
                    element={<LegacySettingsEntry />}
                  />
                  <Route
                    path="/settings/email"
                    element={<Navigate to="/settings/integrations" replace />}
                  />
                  <Route
                    path="/settings/api"
                    element={<LegacySettingsEntry />}
                  />
                  <Route
                    path="/settings/activity"
                    element={<LegacySettingsEntry />}
                  />
                  <Route
                    path="/events/:eventSlug"
                    element={
                      <EventProvider>
                        <Outlet />
                      </EventProvider>
                    }
                  >
                    <Route path="edit" element={<SettingsPage title="Edit event"><EventDetails /></SettingsPage>} />
                    <Route path="dashboard" element={<DashboardHome />} />
                    <Route path="analytics" element={<EventAnalytics />} />
                    <Route path="program/forms" element={<SubmissionForms />} />
                    <Route path="program/forms/new" element={<SubmissionFormCreateRoute />} />
                    <Route
                      path="program/forms/:id/edit"
                      element={<SubmissionFormBuilder />}
                    />
                    <Route path="program/abstracts" element={<Abstracts />} />
                    <Route path="program/abstracts/new" element={<Abstracts />} />
                    <Route path="program/abstracts/:abstractId/edit" element={<Abstracts />} />
                    <Route path="program/speakers" element={<Speakers />} />
                    <Route path="program/speakers/new" element={<Speakers />} />
                    <Route path="program/speakers/:speakerId" element={<Speakers />} />
                    <Route path="program/speakers/:speakerId/edit" element={<Speakers />} />
                    <Route path="program/contacts" element={<Contacts />} />
                    <Route path="program/contacts/new" element={<Contacts />} />
                    <Route path="program/contacts/:contactId/edit" element={<Contacts />} />
                    <Route path="program/event-speakers" element={<Speakers />} />
                    <Route path="program/sponsors" element={<Sponsors />} />
                    <Route path="program/sponsors/new" element={<Sponsors />} />
                    <Route path="program/sponsors/:sponsorId/edit" element={<Sponsors />} />
                    <Route path="program/evaluation" element={<Evaluation />} />
                    <Route path="program/agenda" element={<Agenda />} />
                    <Route path="program/agenda/new" element={<Agenda />} />
                    <Route path="program/agenda/:agendaId/edit" element={<Agenda />} />
                    <Route path="program/recordings" element={<Recordings />} />
                    <Route path="program/readiness" element={<Readiness />} />
                    <Route path="program/agent" element={<AgentOperations />} />
                    <Route
                      path="program/availability"
                      element={<Availability />}
                    />
                    <Route
                      path="program/communications"
                      element={<Communications />}
                    />
                    <Route
                      path="program/communications/templates/:id/edit"
                      element={<CommTemplateEditor />}
                    />
                    <Route path="program/communications/templates/new" element={<CommTemplateEditor />} />
                    <Route path="portals/forms" element={<PortalForms />} />
                    <Route path="portals/forms/new" element={<PortalForms />} />
                    <Route path="portals/forms/:formId/edit" element={<PortalForms />} />
                    <Route path="portals/tasks" element={<TasksAdmin />} />
                    <Route path="portals/tasks/new" element={<TaskEditorPage />} />
                    <Route path="portals/tasks/:taskId/edit" element={<TaskEditorPage />} />
                    <Route path="portals/resources" element={<PortalResourcesAdmin />} />
                    <Route path="portals/resources/new" element={<PortalResourcesAdmin />} />
                    <Route path="portals/resources/:resourceId/edit" element={<PortalResourcesAdmin />} />
                    <Route path="settings/event" element={<SettingsPage title="Event settings"><EventDetails /></SettingsPage>} />
                    <Route path="settings/team" element={<SettingsPage title="Event team"><EventTeam /></SettingsPage>} />
                    <Route path="settings/library" element={<SettingsPage title="Library"><Library /></SettingsPage>} />
                    <Route
                      path="settings/task-templates"
                      element={<SettingsPage title="Task templates"><TaskTemplates /></SettingsPage>}
                    />
                    <Route path="settings/task-templates/new" element={<TaskTemplates />} />
                    <Route path="settings/task-templates/:templateId/edit" element={<TaskTemplates />} />
                    {/* Organizer-only and useless signed out — every call it makes needs a
                    verified identity. */}
                    <Route
                      path="settings/integrations"
                      element={<SettingsPage title="Integrations"><Integrations /></SettingsPage>}
                    />
                    {/* Old URL kept working — bookmarks/links to the previous
                    single-provider page still land. */}
                    <Route
                      path="settings/email"
                      element={
                        <Navigate to="../settings/integrations" replace />
                      }
                    />
                    <Route path="settings/ai-usage" element={<SettingsPage title="AI Usage"><AgentUsage /></SettingsPage>} />
                    <Route path="settings/api" element={<SettingsPage title="API"><ApiKeys /></SettingsPage>} />
                    <Route path="settings/activity" element={<SettingsPage title="Activity"><ActivityLog /></SettingsPage>} />
                    <Route path="settings/readiness" element={<SettingsPage title="Readiness settings"><ReadinessSettings /></SettingsPage>} />
                    <Route path="cms/embeds" element={<EmbedsListPage />} />
                    <Route path="cms/feeds" element={<FeedsListPage />} />
                    <Route path="cms/embeds/new" element={<EmbedEditorPage />} />
                    <Route path="cms/embeds/:embedId/edit" element={<EmbedEditorPage />} />
                    <Route path="cms/embeds/:embedId" element={<LegacyEmbedRedirect />} />
                  </Route>
                  <Route path="/dev/components" element={<ComponentShowcase />} />
                </Route>
              </Route>
              <Route
                path="/e/:eventSlug"
                element={
                  <Suspense
                    fallback={<PublicLoading>Loading event…</PublicLoading>}
                  >
                    <AttendeeSite />
                  </Suspense>
                }
              />
              <Route
                path="/e/:eventSlug/:feed"
                element={
                  <Suspense
                    fallback={<PublicLoading>Loading event…</PublicLoading>}
                  >
                    <EmbedPage />
                  </Suspense>
                }
              />
              <Route path="/embed/:embedId" element={<Suspense fallback={<main className="min-h-screen p-4 text-sm text-muted-foreground">Loading embed…</main>}><PublicEmbedPage /></Suspense>} />
              <Route
                path="/submit/:eventSlug/:formId"
                element={
                  <Suspense
                    fallback={
                      <PublicLoading width="submission">
                        Loading submission form…
                      </PublicLoading>
                    }
                  >
                    <SubmissionPage />
                  </Suspense>
                }
              />
              <Route
                path="/api-docs"
                element={
                  <Suspense
                    fallback={
                      <PublicLoading>Loading API documentation…</PublicLoading>
                    }
                  >
                    <ApiDocs />
                  </Suspense>
                }
              />
              <Route path="*" element={<Navigate to="/events" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </RepoProvider>
  );
}
