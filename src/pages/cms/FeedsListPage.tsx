import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Files, Plus, Rss, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useRepo } from "@/data/repo";
import type { Embed, PublicFeed, PublicFeedFormat } from "@/data/types";

const formats: Array<{ value: PublicFeedFormat; label: string; detail: string }> = [
  { value: "html", label: "HTML", detail: "A readable hosted program page" },
  { value: "basic_html", label: "Basic HTML", detail: "An unstyled page for custom CSS" },
  { value: "json", label: "JSON", detail: "Structured data for applications" },
  { value: "xml", label: "XML", detail: "Structured data for publishing systems" },
  { value: "ical", label: "iCal", detail: "Published agenda calendar subscription" },
];

function feedUrl(token: string) {
  const explicit = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;
  const cloud = import.meta.env.VITE_CONVEX_URL as string | undefined;
  const base = explicit ?? cloud?.replace(/\.convex\.cloud$/, ".convex.site");
  return base ? `${base.replace(/\/$/, "")}/public/feeds/${token}` : `/public/feeds/${token}`;
}

export default function FeedsListPage() {
  const repo = useRepo();
  const { event } = useCurrentEvent();
  const { toast } = useToast();
  const [feeds, setFeeds] = useState<PublicFeed[]>();
  const [embeds, setEmbeds] = useState<Embed[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [embedId, setEmbedId] = useState("");
  const [format, setFormat] = useState<PublicFeedFormat>("json");
  const [busy, setBusy] = useState(false);
  const [deleteFeed, setDeleteFeed] = useState<PublicFeed>();
  const load = useCallback(async () => {
    const [nextFeeds, nextEmbeds] = await Promise.all([repo.publicFeeds.list({ eventId: event.id }), repo.publicEmbeds.list({ eventId: event.id })]);
    setFeeds(nextFeeds); setEmbeds(nextEmbeds); setEmbedId((current) => current || nextEmbeds[0]?.id || "");
  }, [event.id, repo]);
  useEffect(() => { void load().catch(() => setFeeds([])); }, [load]);
  const embedsById = useMemo(() => new Map(embeds.map((embed) => [embed.id, embed])), [embeds]);
  const create = async () => {
    if (!name.trim() || !embedId) return;
    setBusy(true);
    try { await repo.publicFeeds.save({ eventId: event.id, embedId: embedId as Embed["id"], name: name.trim(), format, enabled: false }); setOpen(false); setName(""); await load(); toast({ title: "Feed created", description: "Enable it when the preview is ready to publish." }); }
    catch { toast({ title: "Feed could not be created", variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const toggle = async (feed: PublicFeed) => { await repo.publicFeeds.save({ id: feed.id, eventId: feed.eventId, embedId: feed.embedId, name: feed.name, format: feed.format, enabled: !feed.enabled }); await load(); };
  const copy = async (feed: PublicFeed) => { await navigator.clipboard.writeText(feedUrl(feed.token)); toast({ title: "Feed URL copied" }); };
  const duplicate = async (feed: PublicFeed) => { await repo.publicFeeds.duplicate({ eventId: event.id, feedId: feed.id }); await load(); };
  const remove = async () => { if (!deleteFeed) return; await repo.publicFeeds.remove({ eventId: event.id, feedId: deleteFeed.id }); setDeleteFeed(undefined); await load(); toast({ title: "Feed revoked", description: "Its capability URL now returns not found." }); };

  return <AppLayout title="Feeds">
    <div className="space-y-4">
      <ContentToolbar ariaLabel="Feed controls" primaryAction={<Button size="sm" onClick={() => setOpen(true)} disabled={!embeds.length}><Plus className="h-4 w-4" aria-hidden="true" />Create feed</Button>} />
      {!embeds.length && <p className="text-sm text-muted-foreground">Create an embed first. Feeds reuse its publication filters and safe public fields.</p>}
      {feeds === undefined ? <div className="h-48 animate-pulse rounded-md bg-muted" aria-label="Loading feeds" /> : feeds.length === 0 ? <EmptyState icon={Rss} title="No public feeds yet" message="Create a revocable JSON, XML, HTML, or calendar URL from an approved embed configuration." action={embeds.length ? <Button size="sm" onClick={() => setOpen(true)}>Create feed</Button> : undefined} /> : <div className="divide-y rounded-md bg-background">{feeds.map((feed) => <article key={feed.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-medium">{feed.name}</h2><span className="text-xs text-muted-foreground">{feed.enabled ? "Published" : "Disabled"}</span></div><p className="mt-1 truncate text-sm text-muted-foreground">{formats.find((item) => item.value === feed.format)?.label} · {embedsById.get(feed.embedId)?.name ?? "Embed unavailable"}</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => void toggle(feed)}>{feed.enabled ? "Disable" : "Enable"}</Button><Button variant="outline" size="sm" disabled={!feed.enabled} title={feed.enabled ? "Open feed preview" : "Enable this feed to preview it"} onClick={() => window.open(feedUrl(feed.token), "_blank", "noopener,noreferrer")}><ExternalLink className="h-4 w-4" aria-hidden="true" />Preview</Button><Button variant="outline" size="sm" onClick={() => void copy(feed)}><Copy className="h-4 w-4" aria-hidden="true" />Copy URL</Button><Button variant="outline" size="sm" onClick={() => void duplicate(feed)}><Files className="h-4 w-4" aria-hidden="true" />Duplicate</Button><Button variant="ghost" size="icon" aria-label={`Revoke ${feed.name}`} onClick={() => setDeleteFeed(feed)}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button></div>
      </article>)}</div>}
    </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Create public feed</DialogTitle><DialogDescription>Feeds are disabled until you explicitly publish them.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-1.5"><Label htmlFor="feed-name">Name</Label><Input id="feed-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus /></div><div className="space-y-1.5"><Label htmlFor="feed-embed">Content and filters</Label><Select value={embedId} onValueChange={setEmbedId}><SelectTrigger id="feed-embed"><SelectValue placeholder="Choose an embed" /></SelectTrigger><SelectContent>{embeds.map((embed) => <SelectItem key={embed.id} value={embed.id}>{embed.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label htmlFor="feed-format">Format</Label><Select value={format} onValueChange={(value) => setFormat(value as PublicFeedFormat)}><SelectTrigger id="feed-format"><SelectValue /></SelectTrigger><SelectContent>{formats.map((item) => <SelectItem key={item.value} value={item.value}>{item.label} — {item.detail}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => void create()} disabled={busy || !name.trim() || !embedId}>{busy ? "Creating…" : "Create feed"}</Button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={Boolean(deleteFeed)} onOpenChange={(next) => { if (!next) setDeleteFeed(undefined); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Revoke this feed?</AlertDialogTitle><AlertDialogDescription>The existing URL for {deleteFeed?.name ?? "this feed"} will stop working immediately. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void remove()}>Revoke feed</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </AppLayout>;
}
