import { useEffect, useState } from "react";
import { Check, ChevronDown, CalendarDays, Plus } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useRepo } from "@/data/repo";
import type { Event } from "@/data/types";
import { useOptionalCurrentEvent } from "@/components/EventContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const statusColor: Record<Event["status"], string> = {
  draft: "bg-amber-500",
  published: "bg-emerald-500",
  archived: "bg-muted-foreground",
};

export function EventSwitcher({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const current = useOptionalCurrentEvent()?.event;
  const repo = useRepo();
  const navigate = useNavigate();
  const location = useLocation();
  const [events, setEvents] = useState<Event[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      repo.events.listMine(),
      repo.organizers.getMine().catch(() => null),
    ])
      .then(([rows, organizer]) => {
        if (!cancelled) {
          setEvents(rows);
          setCanCreate(Boolean(organizer));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([]);
          setCanCreate(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);
  const choose = (event: Event) => {
    const match = location.pathname.match(/^\/events\/[^/]+(\/.*)?$/);
    const suffix = match?.[1] || "/dashboard";
    navigate(`/events/${event.slug}${suffix}`);
    onNavigate?.();
  };
  return (
    <div className={cn("pb-1", collapsed ? "px-2" : "px-3")}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center rounded-md text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
              collapsed ? "justify-center p-2" : "gap-2 px-2.5 py-2",
            )}
            aria-label="Switch event"
          >
            {collapsed ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                {current?.name?.[0]?.toUpperCase() || "E"}
              </span>
            ) : (
              <>
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    current
                      ? statusColor[current.status]
                      : "bg-muted-foreground",
                  )}
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {current?.name || "Choose event"}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    open && "rotate-180",
                  )}
                />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side={collapsed ? "right" : "bottom"}
          sideOffset={8}
          className="w-64 rounded-lg bg-muted p-1.5 shadow-none"
        >
          {events.length ? (
            events.map((event) => (
              <DropdownMenuItem
                key={event.id}
                onSelect={() => choose(event)}
                className="gap-2.5 rounded-md px-2.5 py-2"
              >
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    statusColor[event.status],
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{event.name}</span>
                {event.id === current?.id && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            ))
          ) : (
            <div className="px-2.5 py-3 text-sm text-muted-foreground">
              No events yet
            </div>
          )}
          <div className="pt-1.5">
            {canCreate && (
              <DropdownMenuItem
                onSelect={() => navigate("/events?new=1")}
                className="gap-2.5 rounded-md px-2.5 py-2"
              >
                <Plus className="h-4 w-4" />
                New event
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => navigate("/events")}
              className="gap-2.5 rounded-md px-2.5 py-2"
            >
              <CalendarDays className="h-4 w-4" />
              Manage events
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
