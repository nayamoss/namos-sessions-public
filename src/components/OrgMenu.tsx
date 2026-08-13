import { useEffect, useState } from "react";
import { Building2, ChevronDown, Settings2, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRepo } from "@/data/repo";
import type { Organizer } from "@/data/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function OrgMenu({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const repo = useRepo(); const navigate = useNavigate(); const [organizer, setOrganizer] = useState<Organizer | null>(); const [open, setOpen] = useState(false);
  useEffect(() => { let cancelled = false; void repo.organizers.getMine().then((row) => { if (!cancelled) setOrganizer(row); }).catch(() => { if (!cancelled) setOrganizer(null); }); return () => { cancelled = true; }; }, [repo]);
  if (!organizer) return null;
  const go = (path: string) => { navigate(path); onNavigate?.(); };
  return <div className={cn("pt-2", collapsed ? "px-2" : "px-3")}><DropdownMenu open={open} onOpenChange={setOpen}><DropdownMenuTrigger asChild><button type="button" className={cn("flex w-full items-center rounded-md text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35", collapsed ? "justify-center p-2" : "gap-2 px-2.5 py-2")} aria-label="Organization menu"><Building2 className="h-4 w-4 shrink-0" />{!collapsed && <><span className="min-w-0 flex-1 truncate font-medium">Namos Sessions</span><ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} /></>}</button></DropdownMenuTrigger><DropdownMenuContent align="start" side={collapsed ? "right" : "bottom"} sideOffset={8} className="w-56 rounded-lg bg-muted p-1.5 shadow-none"><DropdownMenuItem onSelect={() => go("/settings/organization")} className="gap-2.5 rounded-md px-2.5 py-2"><Settings2 className="h-4 w-4" />Organization settings</DropdownMenuItem><DropdownMenuItem onSelect={() => go("/settings/organization?section=team")} className="gap-2.5 rounded-md px-2.5 py-2"><Users className="h-4 w-4" />Team</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>;
}
