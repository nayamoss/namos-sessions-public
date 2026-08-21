import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, ArrowUpRight, CheckCircle2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { useRepo } from "@/data/repo";
import type { EventAnalyticsSummary } from "@/data/types";
import { cn } from "@/lib/utils";

function percent(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function Metric({ label, value, detail, to }: { label: string; value: string | number; detail: string; to: string }) {
  return (
    <Link to={to} className="group min-w-0 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </Link>
  );
}

function ProgressRow({ label, value, total, tone = "primary" }: { label: string; value: number; total: number; tone?: "primary" | "warning" | "danger" | "muted" }) {
  const width = total === 0 ? 0 : Math.min(100, (value / total) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span>{label}</span>
        <span className="font-medium tabular-nums">{value.toLocaleString()}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
        <div className={cn("h-full rounded-full", tone === "primary" && "bg-primary", tone === "warning" && "bg-amber-500", tone === "danger" && "bg-destructive", tone === "muted" && "bg-muted-foreground")} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function Section({ title, description, to, children }: { title: string; description?: string; to: string; children: ReactNode }) {
  return (
    <section className="min-w-0 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        <Button asChild variant="ghost" size="sm"><Link to={to}>Open <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></Button>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function LoadingState() {
  return <div aria-busy="true" aria-label="Loading event analytics" className="space-y-6"><div className="h-20 animate-pulse rounded-md bg-muted" /><div className="grid gap-6 lg:grid-cols-2"><div className="h-64 animate-pulse rounded-md bg-muted" /><div className="h-64 animate-pulse rounded-md bg-muted" /></div></div>;
}

export default function EventAnalytics() {
  const repo = useRepo();
  const { event } = useCurrentEvent();
  const [summary, setSummary] = useState<EventAnalyticsSummary>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try { setSummary(await repo.analytics.summary({ eventId: event.id })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Analytics could not be loaded."); }
    finally { setLoading(false); }
  }, [event.id, repo]);
  useEffect(() => { void load(); }, [load]);
  const base = `/events/${event.slug}`;
  const empty = useMemo(() => summary ? summary.submissions.total + summary.speakers.total + summary.tasks.total + summary.agenda.total === 0 : false, [summary]);

  return (
    <AppLayout title="Analytics">
      <div className="space-y-3">
        <ContentToolbar
          ariaLabel="Analytics controls"
          primaryAction={<Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />{loading ? "Refreshing…" : "Refresh"}</Button>}
        />
        {loading && !summary ? <LoadingState /> : error && !summary ? (
          <section role="alert" className="flex min-h-64 flex-col items-center justify-center text-center">
            <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold">Analytics unavailable</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{error}</p>
            <Button className="mt-4" variant="outline" size="sm" onClick={() => void load()}>Try again</Button>
          </section>
        ) : summary && empty ? (
          <EmptyState
            icon={CheckCircle2}
            title="Your event snapshot starts here"
            message="Open a call for papers or add speakers to begin measuring program progress."
            action={<><Button asChild size="sm"><Link to={`${base}/program/forms`}>Set up a call</Link></Button><Button asChild variant="outline" size="sm"><Link to={`${base}/program/event-speakers`}>Add speakers</Link></Button></>}
          />
        ) : summary ? (
          <>
            {error && <p role="status" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">Refresh failed. Showing the most recent snapshot.</p>}
            <section aria-label="Event snapshot" className="grid border-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
              <div className="border-b px-1 sm:border-r lg:border-b-0 lg:px-4 lg:first:pl-1"><Metric label="Submissions" value={summary.submissions.total} detail={`${summary.submissions.undecided} need a decision`} to={`${base}/program/abstracts`} /></div>
              <div className="border-b px-1 sm:border-r-0 lg:border-b-0 lg:px-4"><Metric label="Acceptance rate" value={percent(summary.submissions.acceptanceRate)} detail={`${summary.submissions.accepted} accepted of ${summary.submissions.accepted + summary.submissions.declined} decided`} to={`${base}/program/abstracts`} /></div>
              <div className="border-b px-1 sm:border-b-0 sm:border-r lg:px-4"><Metric label="Reviews complete" value={percent(summary.reviews.completionRate)} detail={`${summary.reviews.completed} of ${summary.reviews.assigned} assignments`} to={`${base}/program/evaluation`} /></div>
              <div className="px-1 lg:px-4 lg:pr-1"><Metric label="Accepted sessions scheduled" value={percent(summary.agenda.scheduleRate)} detail={`${summary.agenda.scheduledAccepted} of ${summary.agenda.acceptedSessions} sessions`} to={`${base}/program/agenda`} /></div>
            </section>
            <div className="grid gap-x-8 divide-y lg:grid-cols-2 lg:divide-y-0">
              <div>
                <Section title="Submission pipeline" to={`${base}/program/abstracts`}>
                  <ProgressRow label="Awaiting review" value={summary.submissions.pending} total={summary.submissions.total} tone="warning" />
                  <ProgressRow label="In review" value={summary.submissions.inReview} total={summary.submissions.total} />
                  <ProgressRow label="Unassigned for review" value={summary.reviews.unassigned} total={summary.submissions.undecided} tone="danger" />
                  <ProgressRow label="Accepted" value={summary.submissions.accepted} total={summary.submissions.total} />
                  <ProgressRow label="Declined" value={summary.submissions.declined} total={summary.submissions.total} tone="muted" />
                </Section>
                <div className="border-t"><Section title="Speaker readiness" description={`${summary.speakers.profileComplete} of ${summary.speakers.total} profiles include a bio and headshot.`} to={`${base}/program/event-speakers`}>
                  <ProgressRow label="Confirmed" value={summary.speakers.confirmed} total={summary.speakers.total} />
                  <ProgressRow label="Awaiting response" value={summary.speakers.awaiting} total={summary.speakers.total} tone="warning" />
                  <ProgressRow label="Profile complete" value={summary.speakers.profileComplete} total={summary.speakers.total} />
                </Section></div>
                <div className="border-t"><Section title="CRM pipeline" description="Event contacts by the organizer-owned relationship stage." to={`${base}/program/speakers`}>
                  <ProgressRow label="Qualified" value={summary.crm.qualified} total={summary.crm.total} />
                  <ProgressRow label="Invited" value={summary.crm.invited} total={summary.crm.total} />
                  <ProgressRow label="Confirmed" value={summary.crm.confirmed} total={summary.crm.total} />
                </Section></div>
              </div>
              <div>
                <Section title="Program delivery" to={`${base}/program/agenda`}>
                  <ProgressRow label="Accepted sessions scheduled" value={summary.agenda.scheduledAccepted} total={summary.agenda.acceptedSessions} />
                  <ProgressRow label="Agenda items published" value={summary.agenda.published} total={summary.agenda.total} />
                </Section>
                <div className="border-t"><Section title="Reviewer workload" description={`${summary.reviews.workload.reviewers} assigned reviewers · ${summary.reviews.workload.min}–${summary.reviews.workload.max} assignments each.`} to={`${base}/program/evaluation`}>
                  <ProgressRow label="Light workload" value={summary.reviews.workload.light} total={summary.reviews.workload.reviewers} tone="muted" />
                  <ProgressRow label="Balanced workload" value={summary.reviews.workload.balanced} total={summary.reviews.workload.reviewers} />
                  <ProgressRow label="Heavy workload" value={summary.reviews.workload.heavy} total={summary.reviews.workload.reviewers} tone="warning" />
                </Section></div>
                <div className="border-t"><Section title="Operational follow-through" description="Speaker tasks and message delivery that still need attention." to={`${base}/program/readiness`}>
                  <ProgressRow label="Tasks complete" value={summary.tasks.completed} total={summary.tasks.total} />
                  <ProgressRow label="Tasks overdue" value={summary.tasks.overdue} total={summary.tasks.total} tone="danger" />
                  <ProgressRow label="Messages sent" value={summary.communications.sent} total={summary.communications.total} />
                  <ProgressRow label="Messages failed" value={summary.communications.failed} total={summary.communications.total} tone="danger" />
                </Section></div>
              </div>
            </div>
            <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">This snapshot updates as your event workflow changes.</p>
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
