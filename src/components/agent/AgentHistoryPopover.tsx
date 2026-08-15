import { History } from "lucide-react";
import type { AgentRun, AgentRunId } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge } from "@/components/ui/status-badge";

export function AgentHistoryPopover({ runs, selectedRunId, onSelect, isLoading }: { runs: AgentRun[]; selectedRunId?: AgentRunId; onSelect(id: AgentRunId): void; isLoading: boolean }) {
  return <Popover><PopoverTrigger asChild><Button variant="outline" size="sm"><History className="h-4 w-4" />History</Button></PopoverTrigger><PopoverContent align="start" className="p-0"><Command><CommandList><CommandEmpty>{isLoading ? "Loading agent runs…" : "No agent runs yet."}</CommandEmpty><CommandGroup>{runs.map((run) => <CommandItem key={run.id} value={`${run.objective} ${run.id}`} onSelect={() => onSelect(run.id)} className="flex items-start justify-between gap-3"><span className="line-clamp-2">{run.objective}</span><StatusBadge tone={run.id === selectedRunId ? "info" : "neutral"}>{run.status.replace(/_/g, " ")}</StatusBadge></CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover>;
}
