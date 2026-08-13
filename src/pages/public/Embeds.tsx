import { useMemo, useState } from "react";
import { Check, Clipboard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { embedFeedTitles, publicEmbedUrl, type EmbedFeed } from "@/lib/public-embed";

const embedOptions: Array<{ value: EmbedFeed; label: string; description: string }> = [
  { value: "agenda", label: "Agenda", description: "A published, day-by-day schedule grouped by track." },
  { value: "sessions", label: "List of sessions", description: "A session catalog browsed by track, for content-first browsing." },
  { value: "itinerary", label: "Schedule itinerary", description: "A flat, time-ordered run of show for each day of the event." },
  { value: "speakers", label: "Speaker gallery", description: "Accepted speakers and their public profiles." },
];

/**
 * Event-scoped iframe generator. Route wiring intentionally lives with the CMS
 * feature so this public surface remains usable without the authenticated shell.
 */
export default function Embeds({ initialEventSlug = "" }: { initialEventSlug?: string }) {
  const [eventSlug, setEventSlug] = useState(initialEventSlug);
  const [view, setView] = useState<EmbedFeed>("agenda");
  const [copied, setCopied] = useState(false);
  const safeSlug = eventSlug.trim();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const publicUrl = useMemo(
    () => safeSlug && origin ? publicEmbedUrl(origin, safeSlug, view) : "",
    [origin, safeSlug, view],
  );
  const snippet = publicUrl
    ? `<iframe src="${publicUrl}" title="${embedFeedTitles[view]}" loading="lazy" width="100%" height="720" style="border:0"></iframe>`
    : "";

  const copySnippet = async () => {
    if (!snippet || !navigator.clipboard) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  };

  return (
    <main className="mx-auto min-h-screen max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="max-w-2xl space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Public embeds</p>
        <h1 className="text-2xl font-bold tracking-tight">Put your published program where attendees already are.</h1>
        <p className="text-sm leading-6 text-muted-foreground">These embeds use only an event slug. They never expose drafts, declined proposals, or internal identifiers.</p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-6 rounded-lg bg-card p-5 sm:p-6">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="embed-event-slug">Event slug</label>
            <Input
              id="embed-event-slug"
              value={eventSlug}
              onChange={(event) => { setEventSlug(event.target.value); setCopied(false); }}
              placeholder="your-event"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="text-xs leading-5 text-muted-foreground">Use the same slug as the event's public CFP link.</p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Embed type</legend>
            {embedOptions.map((option) => (
              <label key={option.value} className={`block cursor-pointer rounded-lg p-4 transition-colors ${view === option.value ? "bg-muted" : "bg-background hover:bg-muted/70"}`}>
                <input className="sr-only" type="radio" name="embed-type" value={option.value} checked={view === option.value} onChange={() => { setView(option.value); setCopied(false); }} />
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span>
              </label>
            ))}
          </fieldset>
        </div>

        <div className="space-y-4 rounded-lg bg-card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Get code</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Paste this into any HTML page or CMS code block.</p>
            </div>
            {publicUrl && <Button variant="outline" size="sm" asChild><a href={publicUrl} target="_blank" rel="noreferrer">Open page <ExternalLink /></a></Button>}
          </div>

          {snippet ? (
            <>
              <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs leading-6 text-foreground"><code>{snippet}</code></pre>
              <Button variant="accent" onClick={copySnippet} className="w-full sm:w-auto">
                {copied ? <Check /> : <Clipboard />}{copied ? "Copied" : "Copy code"}
              </Button>
              <aside className="rounded-lg bg-muted/70 p-4 text-xs leading-5 text-muted-foreground">
                The public page filters to published agenda items or accepted speakers before rendering. The event slug is the only value in the URL.
              </aside>
            </>
          ) : (
            <div className="rounded-lg bg-muted p-6 text-sm text-muted-foreground">Enter an event slug to generate the iframe snippet.</div>
          )}
        </div>
      </section>
    </main>
  );
}
