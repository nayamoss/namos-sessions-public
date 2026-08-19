import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DetailPane } from "@/components/shared/DetailPane";
import { EmptyState } from "@/components/shared/EmptyState";
import { RichText } from "@/components/shared/RichText";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cardSurfaceClasses } from "@/components/ui/card";
import { useRepo } from "@/data/repo";
import type { PortalResourcePage } from "@/data/types";

type Draft = { title: string; bodyHtml: string; status: PortalResourcePage["status"] };
const blank: Draft = { title: "", bodyHtml: "", status: "draft" };

export default function PortalResourcesAdmin() {
  const repo = useRepo();
  const { event } = useCurrentEvent();
  const [params, setParams] = useSearchParams();
  const [pages, setPages] = useState<PortalResourcePage[]>([]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const selectedId = params.get("selected");
  const selected = useMemo(() => pages.find((page) => page.id === selectedId), [pages, selectedId]);
  const creating = params.get("mode") === "new";

  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    try { setPages(await repo.portalResources.listAdmin({ eventId: event.id })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load portal resources."); }
    finally { setLoading(false); }
  }, [event.id, repo]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (creating) setDraft(blank);
    else if (selected) setDraft({ title: selected.title, bodyHtml: selected.bodyHtml, status: selected.status });
  }, [creating, selected]);

  const close = () => setParams({});
  const save = async () => {
    setSaving(true); setError(undefined);
    try {
      const id = await repo.portalResources.save({ eventId: event.id, id: selected?.id, ...draft });
      await load(); setParams({ selected: id });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this resource."); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!selected || !window.confirm(`Delete “${selected.title}”? This cannot be undone.`)) return;
    setSaving(true); setError(undefined);
    try { await repo.portalResources.remove({ eventId: event.id, id: selected.id }); close(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this resource."); }
    finally { setSaving(false); }
  };
  const move = async (id: string, direction: -1 | 1) => {
    const index = pages.findIndex((page) => page.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= pages.length) return;
    const reordered = [...pages]; [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setPages(reordered);
    try { await repo.portalResources.reorder({ eventId: event.id, ids: reordered.map((page) => page.id) }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reorder resources."); await load(); }
  };

  const detail = creating || selected ? (
    <DetailPane title={creating ? "New resource" : selected?.title ?? "Resource"} onClose={close}>
      <div className="space-y-5">
        <div className="space-y-2"><Label htmlFor="resource-title">Title</Label><Input id="resource-title" value={draft.title} maxLength={120} onChange={(change) => setDraft((current) => ({ ...current, title: change.target.value }))} /></div>
        <div className="space-y-2"><Label>Content</Label><RichTextEditor value={draft.bodyHtml} onChange={(bodyHtml) => setDraft((current) => ({ ...current, bodyHtml }))} ariaLabel="Resource content" placeholder="Add arrival details, venue guidance, contacts, or speaker policies…" /></div>
        <div className="space-y-2"><Label htmlFor="resource-status">Visibility</Label><Select value={draft.status} onValueChange={(status) => setDraft((current) => ({ ...current, status: status as Draft["status"] }))}><SelectTrigger id="resource-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Draft — organizers only</SelectItem><SelectItem value="published">Published — visible to speakers</SelectItem></SelectContent></Select></div>
        {draft.bodyHtml && <section className="rounded-md bg-muted p-4" aria-label="Resource preview"><p className="mb-2 text-sm font-medium">Preview</p><RichText html={draft.bodyHtml} className="text-sm" /></section>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">{selected && <Button type="button" variant="destructive" onClick={() => void remove()} disabled={saving}>Delete</Button>}<Button type="button" variant="ghost" onClick={close} disabled={saving}>Cancel</Button><Button type="button" variant="accent" onClick={() => void save()} disabled={saving || !draft.title.trim()}>{saving ? "Saving…" : "Save resource"}</Button></div>
      </div>
    </DetailPane>
  ) : undefined;

  return <AppLayout title="Portal resources" detail={detail}><div className="space-y-4"><ContentToolbar ariaLabel="Portal resource controls" primaryAction={<Button type="button" variant="accent" size="sm" onClick={() => setParams({ mode: "new" })}><Plus className="h-4 w-4" />New resource</Button>} />{error && !detail && <p role="alert" className="text-sm text-destructive">{error}</p>}<section className={cardSurfaceClasses("default", "overflow-hidden")} aria-label="Portal resources">{loading ? <p className="p-5 text-sm text-muted-foreground">Loading resources…</p> : pages.length ? pages.map((page, index) => <div key={page.id} className="flex flex-wrap items-center gap-3 border-b border-border/60 p-4 last:border-b-0"><Button type="button" variant="ghost" className="h-auto min-w-0 flex-1 justify-start px-0 py-0 text-left hover:bg-transparent" onClick={() => setParams({ selected: page.id })}><span className="min-w-0"><span className="block truncate text-sm font-medium">{page.title}</span><span className="mt-1 block text-xs text-muted-foreground">{page.status === "published" ? "Published to speakers" : "Draft"} · /{page.slug}</span></span></Button><div className="flex gap-1"><Button type="button" variant="ghost" size="icon" aria-label={`Move ${page.title} up`} disabled={index === 0} onClick={() => void move(page.id, -1)}><ChevronUp className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Move ${page.title} down`} disabled={index === pages.length - 1} onClick={() => void move(page.id, 1)}><ChevronDown className="h-4 w-4" /></Button></div></div>) : <EmptyState icon={BookOpen} title="Create the speaker handbook" message="Publish arrival details, venue guidance, contacts, and policies in one shared resource area." action={<Button type="button" variant="accent" size="sm" onClick={() => setParams({ mode: "new" })}>New resource</Button>} />}</section></div></AppLayout>;
}
