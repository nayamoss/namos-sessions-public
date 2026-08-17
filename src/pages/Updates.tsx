import { useQuery } from "convex-helpers/react/cache";
import { Megaphone } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cardSurfaceClasses } from "@/components/ui/card";

function formatDate(timestamp?: number) {
  return timestamp ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(timestamp) : "Recently";
}

export default function Updates() {
  const entries = useQuery(api.changelog.list, {});
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-6">
      <header>
        <div className="flex items-center gap-2.5">
          <Megaphone className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">What&apos;s new</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">The latest updates to Namos Sessions.</p>
      </header>
      <section className="mt-8 space-y-3" aria-live="polite">
        {entries === undefined ? Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-28 rounded-[12px]" />) : entries.length === 0 ? (
          <div className={cardSurfaceClasses("default", "flex flex-col items-center rounded-[12px] bg-muted p-10 text-center")}>
            <Megaphone className="h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Nothing published yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Check back soon for product updates.</p>
          </div>
        ) : entries.map((entry) => (
          <article key={entry._id} className={cardSurfaceClasses("default", "rounded-[12px] bg-muted p-5")}>
            <p className="text-xs text-muted-foreground">{formatDate(entry.publishedAt)}</p>
            <h2 className="mt-1 text-base font-semibold">{entry.title}</h2>
            {entry.body && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{entry.body}</p>}
          </article>
        ))}
      </section>
    </main>
  );
}
