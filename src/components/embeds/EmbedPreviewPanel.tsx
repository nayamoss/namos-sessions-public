import { useEffect, useState } from "react";
import { ExternalLink, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { useRepo } from "@/data/repo";
import type { EmbedId, EmbedWrite, Event, PublicEmbedView } from "@/data/types";
import { iframeSnippet } from "@/lib/public-embed";
import { EmbedRenderer } from "./EmbedRenderer";

interface EmbedPreviewPanelProps {
  embedId?: EmbedId;
  isDirty: boolean;
  draft: EmbedWrite;
  event: Event;
  mode: "preview" | "code";
  onModeChange: (mode: "preview" | "code") => void;
}

export function EmbedPreviewPanel({ embedId, isDirty, draft, event, mode, onModeChange }: EmbedPreviewPanelProps) {
  const repo = useRepo();
  const { toast } = useToast();
  const [preview, setPreview] = useState<PublicEmbedView | null>();
  const [mobile, setMobile] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setPreview(undefined);
    const { id: _id, ...previewDraft } = draft;
    void repo.publicEmbeds
      .preview({ ...previewDraft, eventId: event.id, name: draft.name.trim() || "Untitled embed" })
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [draft, event.id, reload, repo]);

  const code = embedId ? iframeSnippet(window.location.origin, embedId, draft.view) : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyError(false);
      toast({ title: "Embed code copied" });
    } catch {
      setCopyError(true);
    }
  }

  return (
    <section className={cardSurfaceClasses("default", "min-w-0 bg-muted/40 p-4")} aria-label="Embed preview">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={mode} onValueChange={(value) => onModeChange(value as "preview" | "code")}>
          <TabsList aria-label="Preview mode">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="code">Get code</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex gap-1">
          <Button variant={!mobile ? "secondary" : "ghost"} size="icon" aria-label="Desktop preview" aria-pressed={!mobile} onClick={() => setMobile(false)}>
            <Monitor className="h-4 w-4" />
          </Button>
          <Button variant={mobile ? "secondary" : "ghost"} size="icon" aria-label="Mobile preview" aria-pressed={mobile} onClick={() => setMobile(true)}>
            <Smartphone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Reload preview" onClick={() => setReload((value) => value + 1)}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Open public embed" disabled={!embedId} asChild={Boolean(embedId)}>
            {embedId ? <a href={`/embed/${embedId}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a> : <span><ExternalLink className="h-4 w-4" /></span>}
          </Button>
        </div>
      </div>

      {mode === "code" ? (
        <div className="mt-4 space-y-3">
          {embedId ? (
            <>
              <pre tabIndex={0} className="overflow-x-auto rounded-lg bg-background p-4 font-mono text-xs"><code>{code}</code></pre>
              <Button size="sm" onClick={() => void copy()}>Copy code</Button>
              <p className="text-sm text-muted-foreground">Paste this iframe into an HTML or CMS code block.</p>
              {isDirty && <p className="text-sm text-warning">Save changes before sharing this code so its public view matches the preview.</p>}
              {copyError && <p role="alert" className="text-sm text-destructive">Copy was blocked. Select the code and copy it manually.</p>}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Save this embed to generate permanent code.</p>
          )}
        </div>
      ) : (
        <div className={`mt-4 min-h-[32rem] overflow-auto rounded-lg bg-background p-3 ${mobile ? "mx-auto max-w-[375px]" : ""}`}>
          {preview === undefined ? (
            <div aria-label="Loading preview" className="space-y-3">
              <div className="h-12 animate-pulse rounded bg-muted" />
              <div className="h-24 animate-pulse rounded bg-muted" />
              <div className="h-24 animate-pulse rounded bg-muted" />
            </div>
          ) : preview ? (
            <EmbedRenderer embed={preview} />
          ) : (
            <div className="p-6 text-sm text-muted-foreground" role="alert">
              Preview could not be loaded. <Button variant="link" size="sm" onClick={() => setReload((value) => value + 1)}>Retry</Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
