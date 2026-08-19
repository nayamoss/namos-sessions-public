import { lazy, Suspense, useCallback, useEffect, useState } from "react";
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
} from "react-router-dom";
import {
  SignedIn,
  SignedOut,
  SignIn,
  SignUp,
  RedirectToSignIn,
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
// EventDetails/Library/Integrations/TaskTemplates are no longer standalone routed pages —
// they render as tab panels inside SettingsModal instead (see settings-modal-refactor).
import type { Event } from "@/data/types";
const SubmissionForms = lazy(() => import("@/pages/program/SubmissionForms"));
const Abstracts = lazy(() => import("@/pages/program/Abstracts"));
const Agenda = lazy(() => import("@/pages/program/Agenda"));
const Readiness = lazy(() => import("@/pages/program/Readiness"));
const AgentOperations = lazy(() => import("@/pages/program/AgentOperations"));
const Evaluation = lazy(() => import("@/pages/program/Evaluation"));
const Availability = lazy(() => import("@/pages/program/Availability"));
const SubmissionFormBuilder = lazy(
  () => import("@/pages/program/SubmissionFormBuilder"),
);
const PortalForms = lazy(() => import("@/pages/portal/PortalForms"));
const TasksAdmin = lazy(() => import("@/pages/portal/TasksAdmin"));
const PortalResourcesAdmin = lazy(() => import("@/pages/portal/PortalResourcesAdmin"));
const Communications = lazy(() => import("@/pages/program/Communications"));
const CommTemplateEditor = lazy(
  () => import("@/pages/program/CommTemplateEditor"),
);
const Speakers = lazy(() => import("@/pages/program/Speakers"));
const Sponsors = lazy(() => import("@/pages/program/Sponsors"));
const DashboardHome = lazy(() => import("@/pages/dashboard/DashboardHome"));
const EventAnalytics = lazy(() => import("@/pages/dashboard/EventAnalytics"));
const SubmissionPage = lazy(() => import("@/pages/public/SubmissionPage"));
const PortalHome = lazy(() => import("@/pages/portal/PortalHome"));
const EmbedPage = lazy(() => import("@/pages/public/EmbedPage"));
const AttendeeSite = lazy(() => import("@/pages/public/AttendeeSite"));
const PublicEmbedPage = lazy(() => import("@/pages/public/PublicEmbedPage"));
const EmbedsListPage = lazy(() => import("@/pages/cms/EmbedsListPage"));
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
function RequireAuth() {
  return (
    <>
      <SignedIn>
        <Outlet />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
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

// A signed-out visitor hitting any gated route lands on /sign-in, where Clerk's only route to
// creating an account is a small grey line inside the card. Organizers arriving from the
// marketing site read that as "there is no way in" and leave, so each auth screen carries an
// explicit, full-width link to the other one. `redirect_url` is carried across so a visitor who
// was bounced here from a deep link still lands there after signing up.
function AuthAltAction({
  to,
  prompt,
  action,
}: {
  to: string;
  prompt: string;
  action: string;
}) {
  const { search } = useLocation();
  return (
    <p className="mt-6 text-center text-sm text-[#4A5568]">
      {prompt}{" "}
      <Link
        to={`${to}${search}`}
        onClick={() => track("cta_converted", { destination: to === "/sign-up" ? "sign_up" : "sign_in" })}
        className="font-semibold text-[#0066FF] underline-offset-4 hover:underline"
      >
        {action}
      </Link>
    </p>
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
              <Route path="/demo" element={<DemoLandingPage />} />
              <Route path="/demo/proof" element={<DemoProofPage />} />
              <Route path="/demo/inbox" element={<DemoInboxPage />} />
              <Route path="/updates" element={<Updates />} />
              <Route
                path="/sign-in/*"
                element={
                  <AuthSplitLayout>
                    <SignIn
                      routing="path"
                      path="/sign-in"
                      signUpUrl="/sign-up"
                      // Clerk's own footer prompt is suppressed in favour of the larger
                      // AuthAltAction below; showing both put the same link on screen twice.
                      appearance={{ elements: { footerAction: { display: "none" } } }}
                    />
                    <AuthAltAction
                      to="/sign-up"
                      prompt="New to Namos Sessions?"
                      action="Create an organizer account"
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
                    <Route path="dashboard" element={<DashboardHome />} />
                    <Route path="analytics" element={<EventAnalytics />} />
                    <Route path="program/forms" element={<SubmissionForms />} />
                    <Route
                      path="program/forms/:id/edit"
                      element={<SubmissionFormBuilder />}
                    />
                    <Route path="program/abstracts" element={<Abstracts />} />
                    <Route path="program/speakers" element={<Speakers />} />
                    <Route path="program/sponsors" element={<Sponsors />} />
                    <Route path="program/evaluation" element={<Evaluation />} />
                    <Route path="program/agenda" element={<Agenda />} />
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
                    <Route path="portals/forms" element={<PortalForms />} />
                    <Route path="portals/tasks" element={<TasksAdmin />} />
                    <Route path="portals/resources" element={<PortalResourcesAdmin />} />
                    <Route path="settings/event" element={<DashboardHome />} />
                    <Route path="settings/team" element={<DashboardHome />} />
                    <Route path="settings/library" element={<DashboardHome />} />
                    <Route
                      path="settings/task-templates"
                      element={<DashboardHome />}
                    />
                    {/* Organizer-only and useless signed out — every call it makes needs a
                    verified identity. */}
                    <Route
                      path="settings/integrations"
                      element={<DashboardHome />}
                    />
                    {/* Old URL kept working — bookmarks/links to the previous
                    single-provider page still land. */}
                    <Route
                      path="settings/email"
                      element={
                        <Navigate to="../settings/integrations" replace />
                      }
                    />
                    <Route path="settings/api" element={<DashboardHome />} />
                    <Route path="settings/activity" element={<DashboardHome />} />
                    <Route path="cms/embeds" element={<EmbedsListPage />} />
                    <Route path="cms/embeds/new" element={<EmbedEditorPage />} />
                    <Route path="cms/embeds/:embedId" element={<EmbedEditorPage />} />
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
