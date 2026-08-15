import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRepo } from "@/data/repo";
import type { Organizer } from "@/data/types";
import { cn } from "@/lib/utils";

// This is a settings shortcut, not a switcher — there is only ever one organization.
// It intentionally does NOT look like a dropdown (no chevron, no menu) so it can't be
// mistaken for a second EventSwitcher-style control stacked directly below it. The label
// names the destination instead of repeating the product name in the sidebar header.
export function OrgMenu({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const repo = useRepo(); const navigate = useNavigate(); const [organizer, setOrganizer] = useState<Organizer | null>();
  useEffect(() => { let cancelled = false; void repo.organizers.getMine().then((row) => { if (!cancelled) setOrganizer(row); }).catch(() => { if (!cancelled) setOrganizer(null); }); return () => { cancelled = true; }; }, [repo]);
  if (!organizer) return null;
  const go = () => { navigate("/settings/organization"); onNavigate?.(); };
  return <div className={cn("pt-2", collapsed ? "px-2" : "px-3")}><button type="button" onClick={go} className={cn("flex w-full items-center rounded-md text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none", collapsed ? "justify-center p-2" : "gap-2 px-2.5 py-2")} aria-label="Organization settings" title="Organization settings"><Building2 className="h-4 w-4 shrink-0" />{!collapsed && <span className="min-w-0 flex-1 truncate font-medium">Organization settings</span>}</button></div>;
}
