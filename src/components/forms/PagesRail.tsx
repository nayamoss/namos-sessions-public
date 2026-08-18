import { ChevronDown, ChevronUp, LockKeyhole, Plus, Trash2 } from "lucide-react";
import type { FormPage } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PagesRail({ pages, activePageId, onSelect, onAdd, onRemove, onRename, onMove }: {
  pages: FormPage[];
  activePageId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}) {
  const customPages = pages.filter((page) => page.kind === "custom");
  return <nav aria-label="Form pages" className="space-y-1">
    {pages.map((page, index) => {
      const customIndex = customPages.indexOf(page);
      const movable = page.kind === "custom";
      return <div key={page.id} className={cn("flex items-center gap-1 rounded-md p-1", activePageId === page.id && "bg-muted")}>
        <Button type="button" variant="ghost" onClick={() => onSelect(page.id)} className="h-auto min-w-0 flex-1 justify-start gap-2 rounded px-2 py-1.5 text-left text-sm font-normal">
          <span className="w-4 text-xs text-muted-foreground">{index + 1}</span>
          {page.kind === "system" ? <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
          {movable ? <Input aria-label={`Page name for ${page.label}`} value={page.label} onClick={(event) => event.stopPropagation()} onChange={(event) => onRename(page.id, event.target.value)} className="h-7 min-w-0 border-0 bg-transparent px-1 shadow-none" /> : <span className="truncate">{page.label}</span>}
        </Button>
        {movable ? <>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Move ${page.label} up`} disabled={customIndex === 0} onClick={() => onMove(page.id, "up")}><ChevronUp className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Move ${page.label} down`} disabled={customIndex === customPages.length - 1} onClick={() => onMove(page.id, "down")}><ChevronDown className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={`Remove ${page.label}`} onClick={() => { if (window.confirm(`Remove page “${page.label}”? Its fields will stay in the library.`)) onRemove(page.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
        </> : <span className="px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">System</span>}
      </div>;
    })}
    <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={onAdd}><Plus className="h-4 w-4" /> Add page</Button>
  </nav>;
}
