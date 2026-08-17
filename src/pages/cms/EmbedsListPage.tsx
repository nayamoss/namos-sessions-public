import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Code2, Copy, MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { FilterMenu } from "@/components/shared/StatusTabs";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useRepo } from "@/data/repo";
import type { Embed } from "@/data/types";
import { embedViewLabels, embedWriteFromEmbed, iframeSnippet } from "@/lib/public-embed";

type StatusFilter = "all" | "enabled" | "disabled";

export default function EmbedsListPage() {
  const { event } = useCurrentEvent();
  const repo = useRepo();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [embeds, setEmbeds] = useState<Embed[]>();
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [collapsed, setCollapsed] = useState(false);
  const [deleting, setDeleting] = useState<Embed | null>(null);

  const route = useCallback(
    (suffix = "") => `/events/${event.slug}/cms/embeds${suffix}`,
    [event.slug],
  );
  const load = useCallback(() => {
    setError(false);
    setEmbeds(undefined);
    void repo.publicEmbeds
      .list({ eventId: event.id })
      .then(setEmbeds)
      .catch(() => setError(true));
  }, [event.id, repo]);
  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (embeds ?? []).filter((embed) => {
      const matchesStatus =
        status === "all" || status === (embed.enabled ? "enabled" : "disabled");
      const searchable = `${embed.name} ${embedViewLabels[embed.view]} Styled HTML ${embed.id}`;
      return matchesStatus && searchable.toLocaleLowerCase().includes(needle);
    });
  }, [embeds, query, status]);

  async function copy(embed: Embed) {
    const code = iframeSnippet(window.location.origin, embed.id, embed.view);
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: "Embed code copied" });
    } catch {
      toast({
        title: "Copy was blocked",
        description: "Open the embed to select the code and copy it manually.",
        variant: "destructive",
      });
    }
  }

  async function toggle(embed: Embed) {
    setBusyId(embed.id);
    try {
      await repo.publicEmbeds.save({ ...embedWriteFromEmbed(embed), enabled: !embed.enabled });
      setEmbeds((rows) =>
        rows?.map((row) => (row.id === embed.id ? { ...row, enabled: !row.enabled } : row)),
      );
    } catch {
      toast({ title: "Embed could not be updated", variant: "destructive" });
    } finally {
      setBusyId(undefined);
    }
  }

  async function duplicate(embed: Embed) {
    setBusyId(embed.id);
    try {
      const id = await repo.publicEmbeds.duplicate({ eventId: event.id, embedId: embed.id });
      navigate(route(`/${id}`));
    } catch {
      toast({ title: "Embed could not be duplicated", variant: "destructive" });
      setBusyId(undefined);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await repo.publicEmbeds.remove({ eventId: event.id, embedId: deleting.id });
      setEmbeds((rows) => rows?.filter((row) => row.id !== deleting.id));
      setDeleting(null);
      toast({ title: "Embed deleted" });
    } catch {
      toast({ title: "Embed could not be deleted", variant: "destructive" });
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <AppLayout title="Embeds">
      <div className="space-y-3">
        <ContentToolbar
          ariaLabel="Embed controls"
          search={
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search embeds"
              placeholder="Search by name, view, or ID…"
            />
          }
          utilities={
            <FilterMenu
              value={status}
              onValueChange={(value) => setStatus(value as StatusFilter)}
              ariaLabel="Embed status"
              tabs={[
                { value: "all", label: "All", count: embeds?.length ?? 0 },
                {
                  value: "enabled",
                  label: "Enabled",
                  count: embeds?.filter((item) => item.enabled).length ?? 0,
                },
                {
                  value: "disabled",
                  label: "Disabled",
                  count: embeds?.filter((item) => !item.enabled).length ?? 0,
                },
              ]}
            />
          }
          primaryAction={
            <Button variant="accent" size="sm" onClick={() => navigate(route("/new"))}>
              Add embed
            </Button>
          }
        />

        {error ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <span>Embeds could not be loaded. Try again.</span>
            <Button variant="ghost" size="sm" onClick={load}>Retry</Button>
          </div>
        ) : embeds === undefined ? (
          <div className="space-y-3" aria-label="Loading embeds">
            {[0, 1, 2].map((row) => <div key={row} className={cardSurfaceClasses("default", "h-24 animate-pulse bg-muted")} />)}
          </div>
        ) : embeds.length === 0 || filtered.length === 0 ? (
          <EmptyState
            icon={Code2}
            title={embeds.length === 0 ? "No embeds yet" : "No embeds match these filters"}
            message={embeds.length === 0 ? "Create an embed when you are ready to publish event data elsewhere." : "Clear the search or choose another status."}
            action={<Button variant={embeds.length === 0 ? "accent" : "outline"} size="sm" onClick={() => { if (embeds.length === 0) navigate(route("/new")); else { setQuery(""); setStatus("all"); } }}>{embeds.length === 0 ? "Add embed" : "Clear filters"}</Button>}
          />
        ) : (
          <section className={cardSurfaceClasses("default", "bg-muted/40 p-4")} aria-labelledby="styled-html-heading">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="styled-html-heading" className="flex items-center gap-2 font-medium">
                <Code2 className="h-4 w-4" />
                Styled HTML
                <span className="text-sm font-normal text-muted-foreground">{filtered.length}</span>
              </h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label={collapsed ? "Expand Styled HTML embeds" : "Collapse Styled HTML embeds"}
                aria-expanded={!collapsed}
                onClick={() => setCollapsed((value) => !value)}
              >
                {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </div>
            {!collapsed && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((embed) => (
                  <article key={embed.id} className="rounded-lg bg-background p-4">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none"
                        onClick={() => navigate(route(`/${embed.id}`))}
                      >
                        <h3 className="truncate font-medium">{embed.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{embedViewLabels[embed.view]}</p>
                        <p className="mt-2 font-mono text-xs text-muted-foreground">{embed.id.slice(-8)}</p>
                      </button>
                      <Button variant="ghost" size="icon" aria-label={`Copy code for ${embed.name}`} onClick={() => void copy(embed)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${embed.name}`} disabled={busyId === embed.id}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => navigate(route(`/${embed.id}`))}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void duplicate(embed)}>Duplicate</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void toggle(embed)}>{embed.enabled ? "Disable" : "Enable"}</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(embed)}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs font-medium ${embed.enabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {embed.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {deleting && (
          <section className={cardSurfaceClasses("default", "bg-muted p-4 text-sm")} aria-live="polite">
            <p>Delete “{deleting.name}”? Websites using this embed will show an unavailable message.</p>
            <div className="mt-3 flex gap-2">
              <Button variant="destructive" size="sm" disabled={busyId === deleting.id} onClick={() => void remove()}>
                {busyId === deleting.id ? "Deleting…" : "Delete"}
              </Button>
              <Button variant="ghost" size="sm" disabled={busyId === deleting.id} onClick={() => setDeleting(null)}>Cancel</Button>
            </div>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
