import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export type IntegrationCardStatus = "not_connected" | "connected" | "error";

const badgeConfig: Record<IntegrationCardStatus, { label: string; tone: StatusTone }> = {
  not_connected: { label: "Not connected", tone: "neutral" },
  connected: { label: "Connected", tone: "success" },
  error: { label: "Error", tone: "destructive" },
};

/**
 * One entry in the Settings > Integrations card grid. Clicking anywhere on the card opens
 * that integration's connect/test/disconnect modal via `onOpen` — the card itself holds no
 * connection logic, it only renders whatever status the caller already resolved.
 */
export function IntegrationCard({
  icon: Icon,
  name,
  description,
  status,
  detail,
  onOpen,
}: {
  icon: LucideIcon;
  name: string;
  description: string;
  status: IntegrationCardStatus;
  detail?: string;
  onOpen: () => void;
}) {
  const badge = badgeConfig[status];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative flex flex-col items-start rounded-lg bg-muted/60 p-5 text-left transition-colors hover:bg-muted",
      )}
    >
      <Card className="mb-4 flex h-11 w-11 items-center justify-center bg-background p-0">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </Card>
      <h3 className="mb-1 font-medium text-foreground">{name}</h3>
      <p className="mb-4 flex-1 text-sm text-muted-foreground">{description}</p>
      <div className="flex items-center gap-2">
        <StatusBadge tone={badge.tone}>
          {badge.label}
        </StatusBadge>
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      </div>
      <ArrowRight
        className="absolute right-4 top-4 h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden="true"
      />
    </button>
  );
}
