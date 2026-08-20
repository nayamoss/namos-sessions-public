import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type { FormPage } from "@/data/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PagesRail({ pages, activePageId, fieldCountByPageId, onSelect, onAdd, onDuplicate, onRemove, onRename, onMove }: {
  pages: FormPage[];
  activePageId: string;
  fieldCountByPageId?: Record<string, number>;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate?: (id: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}) {
  const customPages = pages.filter((page) => page.kind === "custom");
  const [renamingPageId, setRenamingPageId] = useState<string>();

  useEffect(() => {
    if (renamingPageId && !customPages.some((page) => page.id === renamingPageId)) {
      setRenamingPageId(undefined);
    }
  }, [customPages, renamingPageId]);

  return (
    <nav aria-label="Form pages" className="space-y-3">
      <div className="px-2">
        <h2 className="text-sm font-semibold">Pages</h2>
      </div>

      <div className="space-y-1">
        {customPages.map((page, index) => {
          const selected = activePageId === page.id;
          const fieldCount = fieldCountByPageId?.[page.id] ?? page.fieldIds.length;
          return (
            <div key={page.id} className={cn("rounded-md", selected && "bg-primary/10 text-primary")}>
              {renamingPageId === page.id ? (
                <form
                  className="p-1.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setRenamingPageId(undefined);
                  }}
                >
                  <Input
                    autoFocus
                    aria-label={`Page name for ${page.label}`}
                    value={page.label}
                    onChange={(event) => onRename(page.id, event.target.value)}
                    onBlur={() => setRenamingPageId(undefined)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setRenamingPageId(undefined);
                    }}
                  />
                </form>
              ) : (
                <div className="flex min-w-0 items-center gap-1 p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onSelect(page.id)}
                    className="h-auto touch-target min-w-0 flex-1 justify-start rounded px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    aria-current={selected ? "page" : undefined}
                  >
                    <span className="block truncate text-sm font-semibold">{page.label || "Untitled page"}</span>
                    <span className={cn("block text-xs", selected ? "text-primary/75" : "text-muted-foreground")}>
                      {fieldCount} {fieldCount === 1 ? "question" : "questions"}
                    </span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={`Actions for ${page.label}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => setRenamingPageId(page.id)}><Pencil className="mr-2 h-4 w-4" />Rename</DropdownMenuItem>
                      {onDuplicate && <DropdownMenuItem onSelect={() => onDuplicate(page.id)}><Copy className="mr-2 h-4 w-4" />Duplicate</DropdownMenuItem>}
                      <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(page.id, "up")}><ArrowUp className="mr-2 h-4 w-4" />Move up</DropdownMenuItem>
                      <DropdownMenuItem disabled={index === customPages.length - 1} onSelect={() => onMove(page.id, "down")}><ArrowDown className="mr-2 h-4 w-4" />Move down</DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => {
                          if (window.confirm(`Remove page “${page.label}”? Its questions will be removed from this form.`)) onRemove(page.id);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" size="sm" className="w-full" onClick={onAdd}>
        <Plus className="h-4 w-4" /> Add page
      </Button>
    </nav>
  );
}
