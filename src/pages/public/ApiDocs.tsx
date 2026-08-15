import { useAuth } from "@clerk/clerk-react";
import { PublicLayout } from "@/components/PublicLayout";

const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL
  ?? import.meta.env.VITE_CONVEX_URL?.replace(/\.convex\.cloud$/, ".convex.site")
  ?? "https://YOUR_DEPLOYMENT.convex.site";

const curl = `curl "${siteUrl}/api/v1/events" \\
  --header "Authorization: Bearer sk_live_YOUR_API_KEY"`; // gitleaks:allow — documentation placeholder, not a credential

const example = `{
  "data": [
    {
      "id": "jd7abc123",
      "name": "AI.Engineer World’s Fair 2026",
      "slug": "ai-engineer-worlds-fair-2026",
      "status": "ACTIVE",
      "websiteUrl": "https://ai.engineer",
      "location": "San Francisco, CA",
      "timezone": "America/Los_Angeles",
      "startsAt": "2026-06-29T16:00:00.000Z",
      "endsAt": "2026-07-01T01:00:00.000Z",
      "description": "The conference for production AI engineering.",
      "programPublishedAt": "2026-05-01T16:00:00.000Z",
      "contactEmail": "program@ai.engineer",
      "logoFileId": "ai-engineer-mark",
      "createdAt": "2026-01-12T18:30:00.000Z",
      "updatedAt": "2026-05-01T16:00:00.000Z"
    }
  ]
}`;

const errorExample = `{
  "code": "unauthorized",
  "message": "Invalid or revoked API key.",
  "details": null
}`;

const fields = [
  ["id", "string", "Convex document ID"],
  ["name", "string", "Event name"],
  ["slug", "string", "URL-safe event identifier"],
  ["status", "enum", "DRAFT, ACTIVE, or ARCHIVED"],
  ["websiteUrl", "string | null", "Public event website"],
  ["location", "string | null", "Human-readable venue or location"],
  ["timezone", "string", "IANA timezone name"],
  ["startsAt", "string", "Start time as an ISO 8601 timestamp"],
  ["endsAt", "string", "End time as an ISO 8601 timestamp"],
  ["description", "string | null", "Public event description"],
  ["programPublishedAt", "string | null", "Program publication time as ISO 8601"],
  ["contactEmail", "string | null", "Public organizer contact"],
  ["logoFileId", "string | null", "Event logo file identifier"],
  ["createdAt", "string", "Creation time as an ISO 8601 timestamp"],
  ["updatedAt", "string", "Last update time as an ISO 8601 timestamp"],
] as const;

const errors = [
  ["400", "Bad request", "Reserved for malformed query parameters; currently unreachable."],
  ["401", "Unauthorized", "The API key is missing, malformed, unknown, or revoked."],
  ["403", "Forbidden", "Reserved for account-level permissions; currently unreachable."],
  ["500", "Internal error", "An unexpected server error occurred."],
] as const;

const navItems = [
  ["Overview", "#overview"],
  ["Authentication", "#authentication"],
  ["List events", "#list-events"],
  ["Event object", "#event-object"],
  ["Errors", "#errors"],
] as const;

function CodeBlock({ label, language = "JSON", children }: { label: string; language?: string; children: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg bg-neutral-900 text-neutral-100">
      <div className="flex items-center justify-between bg-neutral-800 px-4 py-3">
        <span className="font-sans text-xs font-medium text-neutral-300">{label}</span>
        <span className="font-mono text-xs text-neutral-400">{language}</span>
      </div>
      <pre className="max-w-full overflow-x-auto p-4 font-mono text-xs leading-6 sm:p-5 sm:text-sm"><code>{children}</code></pre>
    </div>
  );
}

function CodeRail() {
  return (
    <div className="space-y-6">
      <CodeBlock label="Request" language="cURL">{curl}</CodeBlock>
      <CodeBlock label="200 OK response">{example}</CodeBlock>
    </div>
  );
}

function SectionHeading({ children, description }: { children: string; description?: string }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-balance">{children}</h2>
      {description && <p className="mt-2 max-w-[70ch] text-base leading-7 text-muted-foreground text-pretty">{description}</p>}
    </div>
  );
}

export function ApiDocsContent({ isSignedIn = false }: { isSignedIn?: boolean }) {
  return (
    <PublicLayout width="reference">
      <header className={cardSurfaceClasses("default", "flex items-center gap-3 px-5 py-4 sm:px-6")}>
        <a href="/" className="text-sm font-semibold">Namos Sessions</a>
        <span aria-hidden="true" className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">API reference</span>
      </header>

      <nav aria-label="API reference sections" className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto bg-background px-4 py-3 lg:hidden">
        {navItems.map(([label, href]) => <a key={href} href={href} className="shrink-0 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none">{label}</a>)}
      </nav>

      <div className="grid items-start gap-10 lg:grid-cols-[11rem_minmax(0,1fr)] xl:grid-cols-[11rem_minmax(0,1fr)_minmax(23rem,0.8fr)] xl:gap-12">
        <aside className="sticky top-8 hidden lg:block">
          <p className="px-3 text-xs font-semibold text-foreground">Events API</p>
          <nav aria-label="API reference sections" className="mt-3 space-y-1">
            {navItems.map(([label, href]) => <a key={href} href={href} className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none">{label}</a>)}
          </nav>
          <div className={cardSurfaceClasses("default", "mt-8 bg-muted/60 p-4 text-sm leading-6 text-muted-foreground")}>
            <p className="font-medium text-foreground">API version</p>
            <p className="mt-1 font-mono text-xs">v1 · REST · JSON</p>
          </div>
        </aside>

        <article className="min-w-0">
          <section id="overview" className="scroll-mt-20 pb-12">
            <p className="font-mono text-xs font-medium text-success">Public API · v1</p>
            <h1 className="mt-4 max-w-3xl font-display text-5xl tracking-[-0.03em] text-balance sm:text-6xl">Events API</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground text-pretty">Read your complete conference program from any website, integration, or internal tool.</p>
            <dl className={cardSurfaceClasses("default", "mt-8 grid gap-3 bg-muted/60 p-5 text-sm sm:grid-cols-[7rem_minmax(0,1fr)] sm:p-6")}>
              <dt className="font-medium">Base URL</dt>
              <dd className="min-w-0 overflow-x-auto font-mono text-xs leading-6 text-muted-foreground">{siteUrl}/api/v1</dd>
              <dt className="font-medium">Format</dt>
              <dd className="text-muted-foreground">JSON encoded with UTF-8</dd>
              <dt className="font-medium">Scope</dt>
              <dd className="text-muted-foreground">All events and publication states</dd>
            </dl>
          </section>

          <section id="authentication" className="scroll-mt-20 py-12">
            <SectionHeading description="Every request uses an organizer-generated API key. Keep it server-side and send it with the Authorization header.">Authentication</SectionHeading>
            <div className="mt-6 rounded-lg bg-neutral-900 px-4 py-4 font-mono text-sm text-neutral-100 sm:px-5">Authorization: Bearer sk_live_YOUR_API_KEY</div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{isSignedIn ? <><a className="font-medium text-foreground underline underline-offset-4" href="/events">Choose an event, then open Settings → API</a>. The complete key is shown once.</> : <>Generate a key from Settings → API after signing in. The complete key is shown once.</>}</p>
          </section>

          <section id="list-events" className="scroll-mt-20 py-12">
            <SectionHeading description="Returns every event in this Namos Sessions instance, including draft, active, and archived events.">List all events</SectionHeading>
            <div className="mt-7 flex min-w-0 items-center gap-4 rounded-lg bg-foreground px-4 py-4 text-background sm:px-5">
              <span className="shrink-0 rounded-md bg-success px-3 py-2 text-xs font-semibold text-success-foreground">GET request</span>
              <code className="min-w-0 overflow-x-auto font-mono text-sm">/api/v1/events</code>
            </div>
            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <div className={cardSurfaceClasses("default", "bg-muted/60 p-5")}>
                <p className="text-sm font-semibold">Parameters</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">This endpoint has no path, query, or body parameters.</p>
              </div>
              <div className={cardSurfaceClasses("default", "bg-muted/60 p-5")}>
                <p className="text-sm font-semibold">Successful response</p>
                <p className="mt-2 font-mono text-sm text-muted-foreground">200 OK · {"{ data: Event[] }"}</p>
              </div>
            </div>
            <div className="mt-8 xl:hidden"><CodeRail /></div>
          </section>

          <section id="event-object" className="scroll-mt-20 py-12">
            <SectionHeading description="All timestamps are ISO 8601 strings. Optional values are returned as null instead of being omitted.">The event object</SectionHeading>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">This is a single-tenant API, so the response intentionally contains no <code className="font-mono text-foreground">orgId</code>.</p>
            <div className="mt-7 space-y-2">
              <div className="hidden grid-cols-[11rem_9rem_minmax(0,1fr)] px-4 py-2 text-xs font-medium text-muted-foreground sm:grid">
                <span>Field</span><span>Type</span><span>Description</span>
              </div>
              {fields.map(([name, type, description]) => (
                <div key={name} className={cardSurfaceClasses("default", "grid min-w-0 gap-1 bg-muted/50 px-4 py-3 sm:grid-cols-[11rem_9rem_minmax(0,1fr)] sm:gap-4")}>
                  <code className="font-mono text-sm font-medium">{name}</code>
                  <span className="font-mono text-xs leading-5 text-muted-foreground">{type}</span>
                  <span className="text-sm leading-5 text-muted-foreground">{description}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="errors" className="scroll-mt-20 py-12">
            <SectionHeading description="Every failure uses one predictable JSON envelope: code, message, and details.">Errors</SectionHeading>
            <div className="mt-6"><CodeBlock label="Error response">{errorExample}</CodeBlock></div>
            <div className="mt-7 space-y-2">
              {errors.map(([status, title, description]) => (
                <div key={status} className={cardSurfaceClasses("default", "grid gap-1 bg-muted/50 px-4 py-4 sm:grid-cols-[4rem_8rem_minmax(0,1fr)] sm:gap-4")}>
                  <code className="font-mono text-sm font-semibold">{status}</code>
                  <span className="text-sm font-medium">{title}</span>
                  <span className="text-sm leading-5 text-muted-foreground">{description}</span>
                </div>
              ))}
            </div>
          </section>

          <footer className={cardSurfaceClasses("default", "mt-4 px-5 py-5 text-sm text-muted-foreground")}>No rate limit today — fair use applies.</footer>
        </article>

        <aside aria-label="Request and response examples" className="sticky top-8 hidden min-w-0 xl:block">
          <CodeRail />
        </aside>
      </div>
    </PublicLayout>
  );
}

export default function ApiDocs() {
  const { isSignedIn } = useAuth();
  return <ApiDocsContent isSignedIn={isSignedIn} />;
}
import { cardSurfaceClasses } from "@/components/ui/card";
