import { useEffect, useState } from "react";
import { Check, Code2, Copy, ExternalLink } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useRepo } from "@/data/repo";
import type { EmbedView, PublicEmbedShowcase } from "@/data/types";
import {
  embedViewDescriptions,
  embedViewLabels,
  iframeHeight,
  iframeSnippet,
  publicEmbedOrigin,
  publicEmbedUrl,
} from "@/lib/public-embed";

const showcaseEventSlug = "ai-engineer-sandbox-event";

const viewAnchor: Record<EmbedView, string> = {
  agenda: "agenda",
  schedule_itinerary: "itinerary",
  schedule_grid: "schedule-grid",
  session_list: "sessions",
  speaker_gallery: "speaker-gallery",
  speaker_list: "speakers",
};

function ShowcaseSkeleton() {
  return (
    <div className="space-y-16" aria-label="Loading embed showcase">
      {[0, 1].map((item) => (
        <section key={item} className="space-y-5">
          <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
          <div className={cardSurfaceClasses("muted", "h-[32rem] animate-pulse")} />
        </section>
      ))}
    </div>
  );
}

function EmbedExample({
  item,
  eventSlug,
}: {
  item: PublicEmbedShowcase["embeds"][number];
  eventSlug: string;
}) {
  const { toast } = useToast();
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const origin = publicEmbedOrigin(window.location.origin);
  const snippet = iframeSnippet(origin, item.id, item.view);
  const src = publicEmbedUrl(origin, item.id);
  const anchor = viewAnchor[item.view];

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopyStatus("copied");
      toast({ title: `${embedViewLabels[item.view]} code copied` });
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <article id={anchor} className="scroll-mt-8 space-y-5" aria-labelledby={`${anchor}-title`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h2 id={`${anchor}-title`} className="text-2xl font-semibold text-balance">
            {embedViewLabels[item.view]}
          </h2>
          <p className="mt-2 text-base leading-7 text-muted-foreground text-pretty">
            {embedViewDescriptions[item.view]}
          </p>
        </div>
        <nav aria-label={`${embedViewLabels[item.view]} example links`} className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" size="sm" asChild>
            <a href={`/e/${eventSlug}`} target="_blank" rel="noreferrer">
              Event site <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </a>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <a href={src} target="_blank" rel="noreferrer">
              Open embed <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </a>
          </Button>
        </nav>
      </div>

      <div className={cardSurfaceClasses("muted", "overflow-hidden p-2 sm:p-3")}>
        <iframe
          src={src}
          title={`${embedViewLabels[item.view]} live example — Namos Sessions`}
          loading="lazy"
          width="100%"
          height={iframeHeight(item.view)}
          className="block w-full rounded-md bg-background"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>

      <div className={cardSurfaceClasses("default", "overflow-hidden bg-foreground text-background")}>
        <div className="flex items-center justify-between gap-4 bg-background/10 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <Code2 className="h-4 w-4 shrink-0 text-background/60" />
            <span className="truncate">Paste into your event website</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-background hover:bg-background/10 hover:text-background"
            onClick={() => void copy()}
          >
            {copyStatus === "copied" ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
            {copyStatus === "copied" ? "Copied" : "Copy code"}
          </Button>
        </div>
        <pre tabIndex={0} className="max-w-full overflow-x-auto p-4 font-mono text-xs leading-6 text-background/75 sm:p-5">
          <code>{snippet}</code>
        </pre>
      </div>
      {copyStatus === "error" && (
        <p role="alert" className="text-sm text-destructive">
          Copy was blocked. Select the code above and copy it manually.
        </p>
      )}
    </article>
  );
}

export default function EmbedShowcasePage() {
  const repo = useRepo();
  const [showcase, setShowcase] = useState<PublicEmbedShowcase | null>();
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setShowcase(undefined);
    setError(false);
    void repo.publicEmbeds
      .listShowcase(showcaseEventSlug)
      .then((result) => {
        if (active) setShowcase(result);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [repo]);

  return (
    <PublicLayout width="reference">
      <header className="flex items-center py-2" aria-label="Namos Sessions">
        <a href="/" className="text-base font-semibold">Namos Sessions</a>
      </header>

      <nav aria-label="Public pages" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <a href="/api-docs" className="hover:text-foreground">API reference</a>
        <a href="/sign-in" className="hover:text-foreground">Sign in</a>
        <a href="/sign-up" className="font-medium text-foreground">Create an event</a>
      </nav>

      <section className="max-w-4xl pb-4 pt-8 sm:pb-8 sm:pt-14">
        <p className="font-mono text-sm font-medium text-success">Live embed gallery</p>
        <h1 className="mt-4 max-w-3xl font-display text-5xl tracking-[-0.03em] text-balance sm:text-6xl">
          Put your programme on any event website.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground text-pretty">
          Every view below is a live Namos Sessions embed reading the published programme for {showcase?.eventName ?? "our demo event"}. Update the schedule once and every placement stays current.
        </p>
        <ul className="mt-6 space-y-2 text-base leading-7 text-muted-foreground">
          <li className="flex gap-3"><Check className="mt-1 h-4 w-4 shrink-0 text-success" />Published sessions and accepted speakers only.</li>
          <li className="flex gap-3"><Check className="mt-1 h-4 w-4 shrink-0 text-success" />Responsive, accessible, and ready for any HTML or CMS code block.</li>
        </ul>
      </section>

      {showcase?.embeds.length ? (
        <nav aria-label="Embed examples" className="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto bg-background px-4 py-3 sm:-mx-6 sm:px-6">
          {showcase.embeds.map((item) => (
            <a key={item.id} href={`#${viewAnchor[item.view]}`} className="shrink-0 rounded-md bg-muted px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none">
              {embedViewLabels[item.view]}
            </a>
          ))}
        </nav>
      ) : null}

      <div className="pt-8 sm:pt-12">
        {error ? (
          <div role="alert" className="rounded-lg bg-destructive/10 p-5 text-sm text-destructive">
            The embed gallery could not be loaded. Refresh to try again.
          </div>
        ) : showcase === undefined ? (
          <ShowcaseSkeleton />
        ) : !showcase || showcase.embeds.length === 0 ? (
          <div className={cardSurfaceClasses("muted", "p-6")}>
            <h2 className="text-lg font-semibold">The demo gallery is being prepared.</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Check back after the sample event and its public embeds have been published.</p>
          </div>
        ) : (
          <div className="space-y-24">
            {showcase.embeds.map((item) => (
              <EmbedExample key={item.id} item={item} eventSlug={showcase.eventSlug} />
            ))}
          </div>
        )}
      </div>

      <section className="mt-24 rounded-lg bg-foreground px-6 py-10 text-background sm:px-10 sm:py-12">
        <h2 className="max-w-2xl text-3xl font-semibold text-balance">Build one for your programme.</h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-background/75 text-pretty">
          Choose a view, filter it by track, match your site’s theme, and copy a permanent iframe from the embed studio.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="secondary" asChild><a href="/sign-up">Create an event</a></Button>
          <Button variant="ghost" className="text-background hover:bg-background/10 hover:text-background" asChild><a href={`/e/${showcaseEventSlug}`}>See the attendee site</a></Button>
        </div>
      </section>

      <footer className="pt-6 text-sm text-muted-foreground">© 2026 Namos Sessions</footer>
    </PublicLayout>
  );
}
