type ConvexOrigins = {
  VITE_CONVEX_URL: string;
  CONVEX_SITE_URL: string;
  VITE_PUBLIC_EMBED_ORIGIN: string;
  CLERK_FRONTEND_API_URL?: string;
  PUBLIC_EMBED_ORIGIN?: string;
};

function httpsOrigin(value: string, label: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS.`);
  return url.origin;
}

function convexCspOrigins(env: ConvexOrigins) {
  const cloud = new URL(env.VITE_CONVEX_URL);
  const site = new URL(env.CONVEX_SITE_URL);
  if (cloud.protocol !== "https:" || site.protocol !== "https:") {
    throw new Error("Convex production origins must use HTTPS.");
  }
  return `${cloud.origin} wss://${cloud.host} ${site.origin}`;
}

export function contentSecurityPolicy(env: ConvexOrigins, pathname: string) {
  const clerk = httpsOrigin(env.CLERK_FRONTEND_API_URL || "https://clerk.your-project.example", "Clerk origin");
  const publicEmbed = httpsOrigin(env.PUBLIC_EMBED_ORIGIN || env.VITE_PUBLIC_EMBED_ORIGIN, "Public embed origin");
  const common = `default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self' ${clerk} https://challenges.cloudflare.com https://browser.sentry-cdn.com; connect-src 'self' ${clerk} ${convexCspOrigins(env)} https://o4506791000096768.ingest.us.sentry.io; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-src 'self' ${publicEmbed} ${clerk} https://challenges.cloudflare.com; worker-src 'self' blob:`;
  return `${common}; frame-ancestors ${pathname.startsWith("/embed/") ? "*" : "'none'"}`;
}
