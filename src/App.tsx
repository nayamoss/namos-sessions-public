import { lazy, Suspense, useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
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
import { EventProvider } from "@/components/EventContext";
import { PublicLayout } from "@/components/PublicLayout";
import { AuthSplitLayout } from "@/pages/public/AuthSplitLayout";
import { RepoProvider } from "@/data/provider";
import { useRepo } from "@/data/repo";
const EventDetails = lazy(() => import("@/pages/settings/EventDetails"));
const Library = lazy(() => import("@/pages/settings/Library"));
const Integrations = lazy(() => import("@/pages/settings/Integrations"));
const TaskTemplates = lazy(() => import("@/pages/settings/TaskTemplates"));
const SubmissionForms = lazy(() => import("@/pages/program/SubmissionForms"));
const Abstracts = lazy(() => import("@/pages/program/Abstracts"));
const Agenda = lazy(() => import("@/pages/program/Agenda"));
const Readiness = lazy(() => import("@/pages/program/Readiness"));
const Evaluation = lazy(() => import("@/pages/program/Evaluation"));
const Availability = lazy(() => import("@/pages/program/Availability"));
const SubmissionFormBuilder = lazy(
  () => import("@/pages/program/SubmissionFormBuilder"),
);
const PortalForms = lazy(() => import("@/pages/portal/PortalForms"));
const TasksAdmin = lazy(() => import("@/pages/portal/TasksAdmin"));
const Communications = lazy(() => import("@/pages/program/Communications"));
const Speakers = lazy(() => import("@/pages/program/Speakers"));
const Sponsors = lazy(() => import("@/pages/program/Sponsors"));
const DashboardHome = lazy(() => import("@/pages/dashboard/DashboardHome"));
const SubmissionPage = lazy(() => import("@/pages/public/SubmissionPage"));
const PortalHome = lazy(() => import("@/pages/portal/PortalHome"));
const EmbedPage = lazy(() => import("@/pages/public/EmbedPage"));
const OnboardingWizard = lazy(
  () => import("@/pages/onboarding/OnboardingWizard"),
);
const ApiKeys = lazy(() => import("@/pages/settings/ApiKeys"));
const ApiDocs = lazy(() => import("@/pages/public/ApiDocs"));
const EventsLanding = lazy(() => import("@/pages/events/EventsLanding"));
const OrganizationSettings = lazy(
  () => import("@/pages/settings/OrganizationSettings"),
);
const EventTeam = lazy(() => import("@/pages/settings/EventTeam"));
const ComponentShowcase = lazy(() => import("@/pages/settings/ComponentShowcase"));

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
  const [status, setStatus] = useState<"loading" | "incomplete" | "complete">(
    "loading",
  );
  useEffect(() => {
    let cancelled = false;
    void Promise.all([repo.organizers.getMine(), repo.events.listMine()])
      .then(([organizer, events]) => {
        if (!cancelled)
          setStatus(
            organizer
              ? organizer.onboardingCompletedAt
                ? "complete"
                : "incomplete"
              : events.length
                ? "complete"
                : "incomplete",
          );
      })
      .catch(() => {
        if (!cancelled) setStatus("incomplete");
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname, repo]);
  if (status === "loading")
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (status === "incomplete") return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

function LegacySpeakersRedirect() {
  return <Navigate to="/events" replace />;
}

function EventsEntry() {
  const repo = useRepo();
  const [destination, setDestination] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    void repo.events
      .listMine()
      .then((events) => {
        if (!cancelled)
          setDestination(
            events.length === 1
              ? `/events/${events.at(0)!.slug}/dashboard`
              : "/events",
          );
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

export default function App() {
  return (
    <RepoProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense
            fallback={
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            }
          >
            <Routes>
              <Route
                path="/sign-in/*"
                element={
                  <AuthSplitLayout>
                    <SignIn
                      routing="path"
                      path="/sign-in"
                      signUpUrl="/sign-up"
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
                    element={<OrganizationSettings />}
                  />
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
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/settings/library"
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/settings/task-templates"
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/settings/email"
                    element={<Navigate to="/events" replace />}
                  />
                  <Route
                    path="/settings/api"
                    element={<Navigate to="/events" replace />}
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
                    <Route
                      path="program/availability"
                      element={<Availability />}
                    />
                    <Route
                      path="program/communications"
                      element={<Communications />}
                    />
                    <Route path="portals/forms" element={<PortalForms />} />
                    <Route path="portals/tasks" element={<TasksAdmin />} />
                    <Route path="settings/event" element={<EventDetails />} />
                    <Route path="settings/team" element={<EventTeam />} />
                    <Route path="settings/library" element={<Library />} />
                    <Route
                      path="settings/task-templates"
                      element={<TaskTemplates />}
                    />
                    {/* Organizer-only and useless signed out — every call it makes needs a
                    verified identity. */}
                    <Route
                      path="settings/integrations"
                      element={<Integrations />}
                    />
                    {/* Old URL kept working — bookmarks/links to the previous
                    single-provider page still land. */}
                    <Route
                      path="settings/email"
                      element={
                        <Navigate to="../settings/integrations" replace />
                      }
                    />
                    <Route path="settings/api" element={<ApiKeys />} />
                    <Route path="settings/components" element={<ComponentShowcase />} />
                  </Route>
                </Route>
              </Route>
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
