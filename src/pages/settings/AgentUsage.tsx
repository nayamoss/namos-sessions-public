import { useState } from "react";
import { Activity, Bot, CheckCircle2, Gauge, Zap } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
} from "recharts";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRepoQuery } from "@/data/reactive";
import type { AgentUsageStats } from "@/data/types";
import { cn } from "@/lib/utils";

const RANGE_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

// Sage + sky, never the app's default blue button hue — dashboard colors are data,
// not calls to action, so they get the palette's accent options instead.
const CHART_COLORS = ["#40745C", "#A3BDD2", "#D9A441", "#B0685A", "#8A8577"];

const modelChartConfig: ChartConfig = {
  requests: { label: "Requests", color: CHART_COLORS[0] },
};
const trendChartConfig: ChartConfig = {
  requests: { label: "Requests", color: CHART_COLORS[0] },
  tokens: { label: "Tokens", color: CHART_COLORS[1] },
};

function formatCompact(value: number) {
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function StatCard({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string; detail?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </Card>
  );
}

function DailyTrendChart({ stats }: { stats: AgentUsageStats }) {
  const data = stats.dailyTrend.map((row) => ({ ...row, label: row.date.slice(5) }));
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold">Daily requests</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Operations Agent runs settled per day, last {stats.rangeDays} days.</p>
      <ChartContainer config={trendChartConfig} className="mt-4 aspect-auto h-56 w-full">
        <LineChart data={data} margin={{ left: 4, right: 4, top: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" fontSize={11} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line type="monotone" dataKey="requests" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
        </LineChart>
      </ChartContainer>
    </Card>
  );
}

function TokenTrendChart({ stats }: { stats: AgentUsageStats }) {
  const data = stats.dailyTrend.map((row) => ({ ...row, label: row.date.slice(5) }));
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold">Daily tokens</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Combined input + output tokens per day.</p>
      <ChartContainer config={trendChartConfig} className="mt-4 aspect-auto h-56 w-full">
        <BarChart data={data} margin={{ left: 4, right: 4, top: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" fontSize={11} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="tokens" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </Card>
  );
}

function ModelBreakdownChart({ stats }: { stats: AgentUsageStats }) {
  if (stats.modelBreakdown.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm font-semibold">Model breakdown</p>
        <EmptyState compact message="No settled runs in this range yet." />
      </Card>
    );
  }
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold">Model breakdown</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Share of requests by model, last {stats.rangeDays} days.</p>
      <ChartContainer config={modelChartConfig} className="mt-4 aspect-auto h-56 w-full">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="model" />} />
          <Pie data={stats.modelBreakdown} dataKey="requests" nameKey="model" innerRadius={44} outerRadius={72} strokeWidth={2}>
            {stats.modelBreakdown.map((row, index) => (
              <Cell key={row.model} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="mt-3 space-y-1.5">
        {stats.modelBreakdown.map((row, index) => (
          <li key={row.model} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
              <span className="truncate font-medium">{row.model}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{row.requests} req · {formatCompact(row.tokens)} tok</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ProviderTable({ stats }: { stats: AgentUsageStats }) {
  if (stats.providerBreakdown.length === 0) return null;
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold">Provider details</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-muted-foreground">
              <th className="pb-2 pr-4">Provider</th>
              <th className="pb-2 pr-4">Requests</th>
              <th className="pb-2 pr-4">Input tokens</th>
              <th className="pb-2 pr-4">Output tokens</th>
              <th className="pb-2">Billable</th>
            </tr>
          </thead>
          <tbody>
            {stats.providerBreakdown.map((row) => (
              <tr key={row.provider} className="text-sm">
                <td className="py-1.5 pr-4 font-medium capitalize">{row.provider}</td>
                <td className="py-1.5 pr-4 tabular-nums">{row.requests.toLocaleString()}</td>
                <td className="py-1.5 pr-4 tabular-nums">{row.inputTokens.toLocaleString()}</td>
                <td className="py-1.5 pr-4 tabular-nums">{row.outputTokens.toLocaleString()}</td>
                <td className="py-1.5 tabular-nums">{row.billableRequests.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AllowanceCard({ stats }: { stats: AgentUsageStats }) {
  if (!stats.allowance) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Gauge className="h-4 w-4" aria-hidden="true" />
          <p className="text-xs font-medium">Monthly allowance</p>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">No Namos-managed run has settled for this event's billing owner this month yet.</p>
      </Card>
    );
  }
  const { usedTokens, tokenLimit, usedRuns, runLimit, planSlug } = stats.allowance;
  const tokenPct = tokenLimit === 0 ? 0 : Math.min(100, (usedTokens / tokenLimit) * 100);
  const runPct = runLimit === 0 ? 0 : Math.min(100, (usedRuns / runLimit) * 100);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Gauge className="h-4 w-4" aria-hidden="true" />
          <p className="text-xs font-medium">Monthly allowance · {planSlug}</p>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span>Tokens</span>
            <span className="tabular-nums text-muted-foreground">{formatCompact(usedTokens)} / {formatCompact(tokenLimit)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={tokenLimit} aria-valuenow={usedTokens}>
            <div className="h-full rounded-full" style={{ width: `${tokenPct}%`, backgroundColor: CHART_COLORS[0] }} />
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span>Runs</span>
            <span className="tabular-nums text-muted-foreground">{usedRuns} / {runLimit}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={runLimit} aria-valuenow={usedRuns}>
            <div className="h-full rounded-full" style={{ width: `${runPct}%`, backgroundColor: CHART_COLORS[1] }} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function LoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading AI usage" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}

export default function AgentUsage() {
  const { event } = useCurrentEvent();
  const [days, setDays] = useState(30);
  const { data: stats, error } = useRepoQuery<AgentUsageStats>("agentUsage.stats", { eventId: event.id, days });

  return (
    <>
      <div className="space-y-4">
        <ContentToolbar
          ariaLabel="AI usage controls"
          primaryAction={
            <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          }
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "AI usage could not be loaded."}</p>
        ) : !stats ? (
          <LoadingState />
        ) : stats.totalRequests === 0 && stats.runsStarted === 0 ? (
          <EmptyState
            icon={Bot}
            title="No AI usage yet"
            message="Run the Operations Agent to see token usage, cost signals, and model activity here."
          />
        ) : (
          <>
            <section aria-label="AI usage summary" className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4")}>
              <StatCard icon={Activity} label="Requests" value={stats.totalRequests.toLocaleString()} detail={`${stats.runsStarted} runs started`} />
              <StatCard icon={Zap} label="Total tokens" value={formatCompact(stats.totalTokens)} detail={`${formatCompact(stats.inputTokens)} in · ${formatCompact(stats.outputTokens)} out`} />
              <StatCard
                icon={CheckCircle2}
                label="Run success rate"
                value={stats.successRate === null ? "—" : `${Math.round(stats.successRate * 100)}%`}
                detail={`${stats.completedRuns} completed · ${stats.failedRuns} failed`}
              />
              <AllowanceCard stats={stats} />
            </section>
            <div className="grid gap-4 lg:grid-cols-2">
              <DailyTrendChart stats={stats} />
              <TokenTrendChart stats={stats} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ModelBreakdownChart stats={stats} />
              <ProviderTable stats={stats} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
