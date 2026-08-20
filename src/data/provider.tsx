import { useEffect, useMemo, type ReactNode } from "react";
import { useAuth } from "@clerk/clerk-react";
import { RepoContext, type Repository } from "./repo";
import { createConvexRepo } from "./convex";
import { createConvexReactiveTransport } from "./convex/reactive";
import { createAirtableRepo, createAirtableTransport } from "./airtable";
import { createAirtableReactiveTransport } from "./airtable/reactive";
import { selectedBackend } from "./backend";
import { ReactiveContext } from "./reactive";

function AirtableRepoProvider({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const transport = useMemo(() => createAirtableTransport(() => getToken()), [getToken]);
  const repo = useMemo<Repository>(() => createAirtableRepo(transport), [transport]);
  const reactive = useMemo(() => createAirtableReactiveTransport(transport), [transport]);
  if (!isLoaded) return <p className="p-6 text-sm text-muted-foreground">Checking your secure Airtable session…</p>;
  if (!isSignedIn) return <p className="p-6 text-sm text-muted-foreground">Sign in with the configured Clerk account to use the Airtable data backend.</p>;
  return <RepoContext.Provider value={repo}><ReactiveContext.Provider value={reactive}>{children}</ReactiveContext.Provider></RepoContext.Provider>;
}

// Promise-based writes keep attaching the caller's Clerk token through the existing HTTP
// transport. Reactive reads receive the same session through ConvexProviderWithClerk.
function ConvexRepoProvider({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const repo = useMemo<Repository>(
    () => createConvexRepo(undefined, isSignedIn ? () => getToken({ template: "convex" }) : undefined),
    [getToken, isSignedIn],
  );
  const reactive = useMemo(() => createConvexReactiveTransport(), []);
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void repo.eventMembers.claimPending().catch(() => {
      // Exact email matching already grants the invited event scope. Retry this durable
      // Clerk-subject upgrade on the next authenticated mount if the backend is unavailable.
    });
  }, [isLoaded, isSignedIn, repo]);
  return <RepoContext.Provider value={repo}><ReactiveContext.Provider value={reactive}>{children}</ReactiveContext.Provider></RepoContext.Provider>;
}

// ClerkProvider is mounted once, globally, in main.tsx — both backends read from it here
// rather than each standing up their own instance.
export function RepoProvider({ children }: { children: ReactNode }) {
  if (selectedBackend() === "convex") return <ConvexRepoProvider>{children}</ConvexRepoProvider>;
  return <AirtableRepoProvider>{children}</AirtableRepoProvider>;
}

/** Public saved embeds use only unauthenticated Convex queries and must not initialize Clerk. */
export function PublicEmbedRepoProvider({ children }: { children: ReactNode }) {
  const repo = useMemo<Repository>(() => createConvexRepo(), []);
  const reactive = useMemo(() => createConvexReactiveTransport(), []);
  return (
    <RepoContext.Provider value={repo}>
      <ReactiveContext.Provider value={reactive}>{children}</ReactiveContext.Provider>
    </RepoContext.Provider>
  );
}
