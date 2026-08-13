import { useAuth } from "@clerk/clerk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache";
import type { ReactNode } from "react";
import { selectedBackend } from "./backend";

const queryClient = new QueryClient();
const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convexClient = selectedBackend() === "convex"
  ? new ConvexReactClient(convexUrl || requireConvexUrl())
  : undefined;

function requireConvexUrl(): never {
  throw new Error("VITE_CONVEX_URL is required when VITE_DATA_BACKEND=convex");
}

export function DataClientProviders({ children }: { children: ReactNode }) {
  const content = <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  if (!convexClient) return content;
  return (
    <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
      <ConvexQueryCacheProvider>{content}</ConvexQueryCacheProvider>
    </ConvexProviderWithClerk>
  );
}
