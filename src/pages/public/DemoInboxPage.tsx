import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Mail } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { cardSurfaceClasses } from "@/components/ui/card";
import { stripHtmlTags } from "@/lib/strip-html";

type Delivery = { id: string; toEmail: string; subject: string; bodyHtml: string; attachmentName?: string; attachmentContent?: string; createdAt: number };

export default function DemoInboxPage() {
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/demo/inbox", { credentials: "same-origin" }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 401 ? "This demo workspace has expired." : "The demo inbox is temporarily unavailable.");
      const payload = await response.json() as { deliveries?: Delivery[] };
      if (active) setDeliveries(payload.deliveries ?? []);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "The demo inbox is temporarily unavailable."); });
    return () => { active = false; };
  }, []);

  return (
    <PublicLayout width="wide">
      <header className="py-2"><a href="/" className="text-sm font-semibold">Namos Sessions</a></header>
      <section className="py-8"><p className="text-sm font-semibold text-primary">Captured delivery · no external provider</p><h1 className="mt-4 font-display text-5xl tracking-[-0.04em] sm:text-6xl">Demo inbox</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">Acceptance messages created in the seeded event land here. They use the product’s rendered content and calendar data without contacting a real address.</p></section>
      <nav aria-label="Demo inbox actions" className={cardSurfaceClasses("muted", "flex flex-wrap gap-4 p-4 text-sm")}><Link to="/demo" className="font-medium text-primary hover:underline">Demo entry</Link><Link to="/demo/proof" className="font-medium text-primary hover:underline">Proof table</Link></nav>
      <section aria-label="Captured messages" className="space-y-4 py-6">
        {error && <div role="alert" className={cardSurfaceClasses("default", "p-5 text-sm text-destructive")}>{error}</div>}
        {!error && deliveries === null && <p className="text-sm text-muted-foreground">Loading captured messages…</p>}
        {deliveries?.length === 0 && <div className={cardSurfaceClasses("muted", "p-8 text-center")}><Mail className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" /><h2 className="mt-4 font-semibold">No captured messages yet</h2><p className="mt-2 text-sm text-muted-foreground">Complete the reviewed acceptance step in the organizer walkthrough, then return here.</p></div>}
        {deliveries?.map((delivery) => <article key={delivery.id} className={cardSurfaceClasses("default", "p-5 sm:p-6")}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">To {delivery.toEmail} · {new Date(delivery.createdAt).toLocaleString()}</p><h2 className="mt-2 text-lg font-semibold">{delivery.subject}</h2></div>{delivery.attachmentName && delivery.attachmentContent && <a download={delivery.attachmentName} href={`data:text/calendar;charset=utf-8,${encodeURIComponent(delivery.attachmentContent)}`} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"><Download className="h-4 w-4" aria-hidden="true" />Download {delivery.attachmentName}</a>}</div><p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{stripHtmlTags(delivery.bodyHtml)}</p></article>)}
      </section>
    </PublicLayout>
  );
}
