import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { ClerkProvider } from "@clerk/clerk-react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { DataClientProviders } from "./data/client-providers.tsx";
import { PublicEmbedRepoProvider } from "./data/provider.tsx";
import { clerkAppearanceForTheme, clerkLocalization } from "./lib/clerk-appearance.ts";
import { navigateViaRouter } from "./lib/clerk-router-bridge.ts";
import App from "./App.tsx";
import "./index.css";

const PublicApiDocs = lazy(() => import("./pages/public/ApiDocs.tsx").then((module) => ({ default: module.ApiDocsContent })));
const PublicEmbedPage = lazy(() => import("./pages/public/PublicEmbedPage.tsx"));

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkConfigured = Boolean(publishableKey && publishableKey !== "pk_test_your-clerk-publishable-key");
const publicDocsFallback = window.location.pathname === "/api-docs" && !clerkConfigured;
const publicEmbedRoute = window.location.pathname.startsWith("/embed/");
if (!clerkConfigured && !publicDocsFallback && !publicEmbedRoute) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required.");
}

const root = createRoot(document.getElementById("root")!);
function AuthenticatedApp() {
  const { resolvedTheme } = useTheme();
  // Clerk's own sign-in/sign-up step navigation (e.g. Continue -> next factor, or back to
  // /sign-in on error) falls back to a hard `window.location` reload unless it's told to route
  // through React Router instead — that hard reload was wiping the whole app on every sign-in
  // attempt. App owns its own <BrowserRouter> (kept that way so it stays self-contained for
  // tests), so there's no Router in scope here to call useNavigate() with — routerPush/
  // routerReplace go through the bridge in clerk-router-bridge.ts instead, which App wires up
  // to a real useNavigate() once it mounts.
  return (
    <ClerkProvider
      publishableKey={publishableKey!}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      appearance={clerkAppearanceForTheme(resolvedTheme)}
      localization={clerkLocalization}
      routerPush={(to) => navigateViaRouter(to)}
      routerReplace={(to) => navigateViaRouter(to, { replace: true })}
    >
      <DataClientProviders><ErrorBoundary fallback={<p>Something went wrong. Please refresh the page.</p>}><App /></ErrorBoundary></DataClientProviders>
    </ClerkProvider>
  );
}

if (publicEmbedRoute) {
  root.render(
    <PublicEmbedRepoProvider>
      <ErrorBoundary fallback={<p>Something went wrong. Please refresh the page.</p>}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <BrowserRouter>
            <Suspense fallback={<main className="min-h-screen p-4 text-sm text-muted-foreground">Loading embed…</main>}>
              <Routes>
                <Route path="/embed/:embedId" element={<PublicEmbedPage />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ThemeProvider>
      </ErrorBoundary>
    </PublicEmbedRepoProvider>,
  );
} else if (publicDocsFallback) {
  root.render(
    <ErrorBoundary fallback={<p>Something went wrong. Please refresh the page.</p>}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem><Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading API documentation…</p>}><PublicApiDocs /></Suspense></ThemeProvider>
    </ErrorBoundary>
  );
} else {
  root.render(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem><AuthenticatedApp /></ThemeProvider>
  );
}
