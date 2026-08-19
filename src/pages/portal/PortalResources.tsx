import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { RichText } from "@/components/shared/RichText";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { cardSurfaceClasses } from "@/components/ui/card";
import { useRepo } from "@/data/repo";
import type { PortalResourcePage } from "@/data/types";
import { usePortalIdentity } from "./PortalIdentity";

export default function PortalResources() {
  const repo = useRepo();
  const { eventId, selectedSpeaker } = usePortalIdentity();
  const speakerId = selectedSpeaker?.id;
  const [pages, setPages] = useState<PortalResourcePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    if (!eventId || !speakerId) { setPages([]); setLoading(false); return () => { active = false; }; }
    setLoading(true); setError(undefined);
    void repo.portalResources.listPublished({ eventId, speakerId })
      .then((next) => { if (active) setPages(next); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load speaker resources."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId, repo, speakerId]);

  if (loading) return <SkeletonList rows={3} label="Loading speaker resources…" />;
  if (error) return <div className={cardSurfaceClasses("default", "p-5")}><p role="alert" className="text-sm text-destructive">{error}</p></div>;
  if (!pages.length) return <EmptyState icon={BookOpen} title="No resources have been published" message="Arrival details, venue guidance, and speaker policies will appear here when the organizer publishes them." />;
  return <div className="space-y-4">{pages.map((page) => <article key={page.id} id={page.slug} className={cardSurfaceClasses("default", "p-5 sm:p-6")}><h2 className="text-base font-semibold">{page.title}</h2><RichText html={page.bodyHtml} className="mt-3 max-w-[75ch] text-sm text-muted-foreground" /></article>)}</div>;
}
