import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, CircleDashed, ExternalLink, FileCheck2, Video } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { cardSurfaceClasses } from "@/components/ui/card";
import { buildProofRequirements, readProofMetadata, type ProofStatus } from "@/lib/demo-proof";
import { cn } from "@/lib/utils";

const statusClasses: Record<ProofStatus, string> = {
  PASS: "bg-success/10 text-success",
  FAIL: "bg-destructive/10 text-destructive",
  "NOT RUN": "bg-muted text-muted-foreground",
};

export default function DemoProofPage() {
  const [eventSlug, setEventSlug] = useState<string | null>(null);
  const requirements = buildProofRequirements();
  const metadata = readProofMetadata();
  const videoUrl = import.meta.env.VITE_DEMO_VIDEO_URL as string | undefined;
  const posterUrl = import.meta.env.VITE_DEMO_VIDEO_POSTER_URL as string | undefined;
  const transcript = import.meta.env.VITE_DEMO_VIDEO_TRANSCRIPT as string | undefined;
  const passCount = requirements.filter((item) => item.status === "PASS").length;
  useEffect(() => {
    let active = true;
    void fetch("/api/demo/workspaces/current", { credentials: "same-origin" }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as { workspace?: { eventSlug?: string } };
      if (active && payload.workspace?.eventSlug) setEventSlug(payload.workspace.eventSlug);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const resolveProofRoute = (id: string, fallback: string) => {
    if (!eventSlug) return fallback;
    if (id === "control-room" || id === "walkthrough" || id === "workspace-reset") return `/events/${eventSlug}/dashboard`;
    if (id === "operations-agent") return `/events/${eventSlug}/program/agent`;
    if (id === "resources") return "/portal/resources";
    if (id === "captured-delivery") return "/demo/inbox";
    if (id === "publication") return `/e/${eventSlug}`;
    return fallback;
  };
  const columns: DataGridColumn<(typeof requirements)[number]>[] = [
    { key: "status", header: "Status", width: "8rem", cell: (item) => <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", statusClasses[item.status])}>{item.status}</span> },
    { key: "requirement", header: "Requirement", cell: (item) => <><p className="font-medium">{item.requirement}</p>{item.note && <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}</> },
    { key: "test", header: "Test result", cell: (item) => <span className="font-mono text-xs text-muted-foreground">{item.testName ?? "No passing test supplied"}</span> },
    { key: "proof", header: "Proof", width: "9rem", cell: (item) => <Link to={resolveProofRoute(item.id, item.proofRoute)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Open route <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link> },
  ];

  return (
    <PublicLayout width="reference">
      <header className="flex flex-wrap items-center justify-between gap-4 py-2"><a href="/" className="text-sm font-semibold">Namos Sessions</a><Link to="/demo" className="text-sm font-semibold text-primary hover:underline">Open live demo</Link></header>
      <section className="py-8 lg:py-12">
        <p className="text-sm font-semibold text-primary">Public verification</p>
        <h1 className="mt-4 max-w-4xl font-display text-5xl tracking-[-0.04em] text-balance sm:text-6xl">Proof, routes, and test evidence.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">This page does not award itself credit. A requirement shows PASS only when deployment metadata names a passing test and provides a direct proof route.</p>
        <dl className="mt-7 grid gap-3 text-sm sm:grid-cols-3">
          <div className={cardSurfaceClasses("muted", "p-4")}><dt className="text-muted-foreground">Result</dt><dd className="mt-1 font-semibold">{passCount} / {requirements.length} passing</dd></div>
          <div className={cardSurfaceClasses("muted", "p-4")}><dt className="text-muted-foreground">Deployed commit</dt><dd className="mt-1 break-all font-mono text-xs">{metadata.commit ?? "Not supplied"}</dd></div>
          <div className={cardSurfaceClasses("muted", "p-4")}><dt className="text-muted-foreground">Verified</dt><dd className="mt-1">{metadata.verifiedAt ? new Date(metadata.verifiedAt).toLocaleString() : "Not run"}</dd></div>
        </dl>
        {metadata.summary && <p className="mt-4 text-sm text-muted-foreground">{metadata.summary}</p>}
      </section>

      <section aria-labelledby="video-title" className="grid gap-6 py-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
        <div className={cardSurfaceClasses("default", "overflow-hidden bg-foreground")}>
          {videoUrl ? <video controls preload="metadata" poster={posterUrl} className="aspect-video w-full" aria-label="Namos Sessions 90-second walkthrough"><source src={videoUrl} /></video> : <div className="flex aspect-video flex-col items-center justify-center gap-3 p-8 text-center text-background"><Video className="h-8 w-8" aria-hidden="true" /><p className="font-semibold">90-second walkthrough not published yet</p><p className="max-w-md text-sm text-background/70">The video stays visibly pending until a real recording URL is supplied at deploy time.</p></div>}
        </div>
        <div><h2 id="video-title" className="text-2xl font-semibold">Walkthrough video</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">The configured recording must show the same seeded workflow linked below. A poster and text transcript are supported alongside the recording.</p>{transcript ? <details className={cardSurfaceClasses("muted", "mt-5 p-4")}><summary className="cursor-pointer text-sm font-semibold">Read transcript</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{transcript}</p></details> : <p className="mt-5 text-sm text-muted-foreground">Transcript pending with the final recording.</p>}</div>
      </section>

      <section aria-labelledby="requirements-title" className="py-8">
        <div className="flex items-center gap-3"><FileCheck2 className="h-6 w-6 text-primary" aria-hidden="true" /><h2 id="requirements-title" className="text-2xl font-semibold">Requirement-by-requirement evidence</h2></div>
        <div className="mt-5"><DataGrid rows={requirements} columns={columns} empty="No proof requirements configured." rowActivation="none" ariaLabel="Requirement evidence" minWidth={760} /></div>
      </section>

      <section className={cardSurfaceClasses("muted", "my-8 grid gap-4 p-5 sm:grid-cols-2")}><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-success" aria-hidden="true" /><div><h2 className="font-semibold">What PASS means</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">A named automated test passed for the deployed commit and its proof route is available.</p></div></div><div className="flex gap-3"><CircleDashed className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden="true" /><div><h2 className="font-semibold">What NOT RUN means</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Evidence is absent or incomplete. It is intentionally not represented as a pass.</p></div></div></section>
    </PublicLayout>
  );
}
