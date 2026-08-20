type PublicCspConfig = {
  VITE_CLERK_PUBLISHABLE_KEY?: string;
  VITE_CONVEX_URL?: string;
  CONVEX_SITE_URL?: string;
};

const placeholderFragments = ["your-project", "your-clerk-publishable-key"];

function isPlaceholder(value: string) {
  return placeholderFragments.some((fragment) => value.includes(fragment));
}

function safeServiceOrigin(value: string | undefined, hostnameSuffix: string) {
  if (!value || isPlaceholder(value)) return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !url.hostname.endsWith(hostnameSuffix)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function clerkOriginFromPublishableKey(value: string | undefined) {
  if (!value || isPlaceholder(value) || !/^pk_(test|live)_/.test(value))
    return null;

  try {
    const encoded = value.replace(/^pk_(test|live)_/, "");
    const hostname = atob(encoded).replace(/\$$/, "");
    if (!/^[a-z0-9.-]+$/i.test(hostname)) return null;

    const url = new URL(`https://${hostname}`);
    if (url.hostname !== hostname || url.port || !hostname.includes("."))
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

function directive(name: string, values: Array<string | null>) {
  return `${name} ${[...new Set(values.filter((value): value is string => Boolean(value)))].join(" ")}`;
}

export function createContentSecurityPolicy(
  env: PublicCspConfig,
  pathname: string,
) {
  const clerkOrigin = clerkOriginFromPublishableKey(
    env.VITE_CLERK_PUBLISHABLE_KEY,
  );
  const convexOrigin = safeServiceOrigin(env.VITE_CONVEX_URL, ".convex.cloud");
  const convexSiteOrigin = safeServiceOrigin(
    env.CONVEX_SITE_URL,
    ".convex.site",
  );
  const convexWebSocketOrigin =
    convexOrigin?.replace(/^https:/, "wss:") ?? null;

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    directive("script-src", [
      "'self'",
      clerkOrigin,
      "https://challenges.cloudflare.com",
      "https://browser.sentry-cdn.com",
    ]),
    directive("connect-src", [
      "'self'",
      clerkOrigin,
      convexOrigin,
      convexWebSocketOrigin,
      convexSiteOrigin,
      "https://sentry-org.ingest.us.sentry.io",
    ]),
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    directive("frame-src", [clerkOrigin, "https://challenges.cloudflare.com"]),
    "worker-src 'self' blob:",
    `frame-ancestors ${pathname.startsWith("/embed/") ? "*" : "'none'"}`,
  ].join("; ");
}
