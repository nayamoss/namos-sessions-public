import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useRepo } from "@/data/repo";
import type { EmbedId, PublicEmbedView } from "@/data/types";
import { EmbedRenderer } from "@/components/embeds/EmbedRenderer";
import { useReportSizeToParent } from "@/lib/public-embed";
export default function PublicEmbedPage() {
  const { embedId } = useParams();
  const repo = useRepo();
  const [embed, setEmbed] = useState<PublicEmbedView | null>();
  const [error, setError] = useState(false);
  const contentRef = useRef<HTMLElement | null>(null);
  // min-h-screen (below, in the loaded state) would force a full-viewport height
  // report to the host iframe when this page is embedded — clamping the reported
  // height to whatever the iframe already is instead of letting it grow/shrink to
  // fit content, since the iframe's own "viewport" is the height it's currently
  // rendered at. So the loaded main intentionally does NOT use min-h-screen.
  useReportSizeToParent(embedId as EmbedId, contentRef);
  useEffect(() => {
    if (!embedId) {
      setEmbed(null);
      return;
    }
    void repo.publicEmbeds
      .getPublic(embedId)
      .then(setEmbed)
      .catch(() => setError(true));
  }, [embedId, repo]);
  if (error)
    return (
      <main className="min-h-screen p-4 text-sm text-muted-foreground">
        This embed could not be loaded. Refresh to try again.
      </main>
    );
  if (embed === undefined)
    return (
      <main className="min-h-screen space-y-3 p-4" aria-label="Loading embed">
        <div
          className={cardSurfaceClasses(
            "default",
            "h-12 animate-pulse bg-muted",
          )}
        />
        <div
          className={cardSurfaceClasses(
            "default",
            "h-20 animate-pulse bg-muted",
          )}
        />
        <div
          className={cardSurfaceClasses(
            "default",
            "h-20 animate-pulse bg-muted",
          )}
        />
      </main>
    );
  if (!embed)
    return (
      <main className="flex min-h-screen items-center justify-center p-4 text-sm text-muted-foreground">
        This embed is unavailable.
      </main>
    );
  return (
    <main ref={contentRef} className="p-3 sm:p-4">
      <EmbedRenderer embed={embed} />
    </main>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
