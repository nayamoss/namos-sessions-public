import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import { ThemeProvider } from "next-themes";
import { ClerkProvider } from "@clerk/clerk-react";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { DataClientProviders } from "./data/client-providers.tsx";
import { clerkAppearance, clerkLocalization } from "./lib/clerk-appearance.ts";
import App from "./App.tsx";
import "./index.css";

const PublicApiDocs = lazy(() => import("./pages/public/ApiDocs.tsx").then((module) => ({ default: module.ApiDocsContent })));

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkConfigured = Boolean(publishableKey && publishableKey !== "pk_test_your-clerk-publishable-key");
const publicDocsFallback = window.location.pathname === "/api-docs" && !clerkConfigured;
if (!clerkConfigured && !publicDocsFallback) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required.");
}

const root = createRoot(document.getElementById("root")!);
if (publicDocsFallback) {
  root.render(
    <ErrorBoundary fallback={<p>Something went wrong. Please refresh the page.</p>}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}><Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading API documentation…</p>}><PublicApiDocs /></Suspense></ThemeProvider>
    </ErrorBoundary>
  );
} else {
  root.render(
    <ClerkProvider publishableKey={publishableKey!} signInUrl="/sign-in" signUpUrl="/sign-up" appearance={clerkAppearance} localization={clerkLocalization}>
      <DataClientProviders>
        <ErrorBoundary fallback={<p>Something went wrong. Please refresh the page.</p>}>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}><App /></ThemeProvider>
        </ErrorBoundary>
      </DataClientProviders>
    </ClerkProvider>
  );
}
