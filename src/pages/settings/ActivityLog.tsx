import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ListChecks, RefreshCcw } from "lucide-react";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { StatCard } from "@/components/shared/StatCard";
import { ActivityFeed } from "@/components/settings/ActivityFeed";
import { ActivityLogTable } from "@/components/settings/ActivityLogTable";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRepo } from "@/data/repo";
import type { ActivityEntry } from "@/data/types";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export default function ActivityLog() {
  const repo = useRepo();
  const { event } = useCurrentEvent();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await repo.activity.list({ eventId: event.id }));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the activity feed.");
    } finally {
      setLoading(false);
    }
  }, [repo, event.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const last24h = entries.filter((entry) => entry.createdAt >= Date.now() - ONE_DAY_MS).length;
  const errors24h = entries.filter((entry) => entry.status === "error" && entry.createdAt >= Date.now() - ONE_DAY_MS).length;

  return (
    <>
      <div className="space-y-4">
        <p className="text-base text-muted-foreground">
          Everything that happened on this event — agenda changes, comms sends, agent runs, notifications, and API requests, in one feed.
        </p>
        <ContentToolbar
          ariaLabel="Activity actions"
          primaryAction={
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCcw className={loading ? "animate-spin" : undefined} />
              Refresh
            </Button>
          }
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}{" "}
            <Button type="button" variant="ghost" className="h-auto p-0 underline underline-offset-4" onClick={() => void load()}>
              Try again
            </Button>
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Events, last 24h" value={loading ? "—" : last24h} icon={ListChecks} />
          <StatCard label="Errors, last 24h" value={loading ? "—" : errors24h} icon={AlertTriangle} />
          <StatCard label="Total in feed" value={loading ? "—" : entries.length} icon={RefreshCcw} />
        </div>
        <Tabs defaultValue="timeline">
          <TabsList>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
          </TabsList>
          <TabsContent value="timeline" className="pt-3">
            <ActivityFeed entries={entries} loading={loading} />
          </TabsContent>
          <TabsContent value="table" className="pt-3">
            <ActivityLogTable entries={entries} loading={loading} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
