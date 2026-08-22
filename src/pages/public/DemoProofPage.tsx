import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bot, Check, CircleDashed, ClipboardCheck, ExternalLink, FileText, Play, ShieldCheck, TriangleAlert, Video } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
import { buildProofRequirements, readProofMetadata, readWalkthroughMedia, resolveProofDestination, type DemoWorkspaceContext, type ProofStatus } from "@/lib/demo-proof";
import { cn } from "@/lib/utils";

const statusDetails: Record<ProofStatus, { label: string; classes: string; icon: typeof Check }> = {
  PASS: { label: "Verified", classes: "bg-success/10 text-success", icon: Check },
  FAIL: { label: "Check failed", classes: "bg-destructive/10 text-destructive", icon: TriangleAlert },
  "NOT RUN": { label: "Evidence pending", classes: "bg-muted text-muted-foreground", icon: CircleDashed },
};

function formatVerificationDate(value: string | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid verification date";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export default function DemoProofPage() {
  const [workspace, setWorkspace] = useState<DemoWorkspaceContext | null>(null);
  const [workspaceChecked, setWorkspaceChecked] = useState(false);
  const requirements = buildProofRequirements();
  const metadata = readProofMetadata();
  const media = readWalkthroughMedia();
  const passCount = requirements.filter((item) => item.status === "PASS").length;

  useEffect(() => {
    let active = true;
    void fetch("/api/demo/workspaces/current", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { workspace?: { eventSlug?: string; activeRole?: DemoWorkspaceContext["activeRole"] } };
        if (active && payload.workspace?.eventSlug && payload.workspace.activeRole) {
          setWorkspace({ eventSlug: payload.workspace.eventSlug, activeRole: payload.workspace.activeRole });
        }
      })
      .catch(() => undefined)
      .finally(() => { if (active) setWorkspaceChecked(true); });
    return () => { active = false; };
  }, []);

  return (
    <PublicLayout width="reference">
      <header className="py-2">
        <a href="/" className="text-sm font-semibold">Namos Sessions</a>
      </header>

      <section className="max-w-4xl py-8 lg:py-12">
        <h1 className="max-w-3xl font-display text-4xl tracking-[-0.035em] text-balance sm:text-5xl">Verify the judge demo for yourself.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">Start with the live product, follow one connected event from submission to publication, then inspect the checks behind each claim.</p>
      </section>

      <nav aria-label="Proof page actions" className="flex flex-wrap items-center gap-3 border-y py-4">
        <Button asChild size="lg"><Link to="/demo#roles"><Play aria-hidden="true" />Start the live demo</Link></Button>
        <Button asChild size="lg" variant="outline"><a href="#verify"><ClipboardCheck aria-hidden="true" />See what to verify</a></Button>
        <span className="text-sm text-muted-foreground" role="status">
          {!workspaceChecked ? "Checking for an active demo…" : workspace ? `Demo ready · ${workspace.activeRole} role active` : "No demo workspace yet"}
        </span>
      </nav>

      <section aria-labelledby="walkthrough-title" className="grid gap-6 py-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] lg:items-center">
        <div className={cardSurfaceClasses("default", "overflow-hidden bg-foreground")}>
          {media.isPublished ? (
            <video controls preload="metadata" poster={media.posterUrl} className="aspect-video w-full" aria-label="Namos Sessions 90-second product walkthrough">
              <source src={media.videoUrl} type="video/mp4" />
              <track kind="captions" src={media.captionsUrl} srcLang="en" label="English" default />
            </video>
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 p-8 text-center text-background">
              <Video className="h-8 w-8" aria-hidden="true" />
              <p className="font-semibold">90-second recording is not published yet</p>
              <p className="max-w-md text-sm leading-6 text-background/75">This stays pending until the real production recording, poster, captions, and transcript are all available.</p>
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            {media.isPublished ? <><Check className="h-4 w-4 text-success" aria-hidden="true" />Published with captions and transcript</> : <><CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Recording evidence pending</>}
          </div>
          <h2 id="walkthrough-title" className="mt-3 text-2xl font-semibold text-balance">Watch the 90-second overview</h2>
          <p className="mt-3 max-w-prose text-sm leading-6 text-muted-foreground">The recording is a shortcut, not a substitute for the live product. The five-minute route below lets you inspect and change the same seeded event yourself.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild variant="outline"><Link to="/demo?proof=walkthrough">Run the live walkthrough<ArrowRight aria-hidden="true" /></Link></Button>
            {media.isPublished && media.transcriptUrl && <Button asChild variant="ghost"><a href={media.transcriptUrl}>Read transcript<FileText aria-hidden="true" /></a></Button>}
          </div>
        </div>
      </section>

      <section id="verify" aria-labelledby="verify-title" className="scroll-mt-6 py-10">
        <div className="max-w-3xl">
          <h2 id="verify-title" className="text-2xl font-semibold">Try it yourself</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Each row tells you what to look for, how it was checked, and where to open the working product. If the required role is not active, the action prepares the correct demo context first.</p>
        </div>
        <ol className="mt-6 divide-y border-y">
          {requirements.map((item, index) => {
            const status = statusDetails[item.status];
            const StatusIcon = status.icon;
            const destination = resolveProofDestination(item, workspace);
            return (
              <li key={item.id} className="grid gap-4 py-5 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-start">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums" aria-hidden="true">{index + 1}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-balance">{item.requirement}</h3>
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium", status.classes)}><StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />{status.label}</span>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{item.explanation}</p>
                  <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Automated check:</span> {item.testName ?? "No passing check has been supplied for this deployment."}</p>
                  {item.note && <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}
                </div>
                <Button asChild variant="outline" className="w-full sm:w-auto"><Link to={destination.route}>{destination.label}<ArrowRight aria-hidden="true" /></Link></Button>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="record-title" className="py-10">
        <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" /><h2 id="record-title" className="text-2xl font-semibold">Verification record</h2></div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">PASS means a named automated check was supplied for this deployed build. It does not replace the live route above.</p>
        <dl className="mt-6 divide-y border-y text-sm">
          <div className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr]"><dt className="text-muted-foreground">Automated evidence</dt><dd className="font-medium">{passCount} of {requirements.length} requirements verified</dd></div>
          <div className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr]"><dt className="text-muted-foreground">Deployed commit</dt><dd className="break-all font-mono text-xs">{metadata.commit ?? "Not recorded"}</dd></div>
          <div className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr]"><dt className="text-muted-foreground">Last verified</dt><dd>{formatVerificationDate(metadata.verifiedAt)}</dd></div>
          <div className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr]"><dt className="text-muted-foreground">Test summary</dt><dd>{metadata.summary ?? "No production test summary has been supplied."}</dd></div>
          <div className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr]"><dt className="text-muted-foreground">Video package</dt><dd>{media.isPublished ? "MP4, poster, captions, and transcript available" : `Pending: ${media.missing.join(", ")}`}</dd></div>
        </dl>
      </section>

      <section className={cardSurfaceClasses("muted", "my-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between")}>
        <div className="flex items-start gap-3"><Bot className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" /><div><h2 className="font-semibold">Ready to inspect the product?</h2><p className="mt-1 text-sm text-muted-foreground">Start with Organizer to see the Control Room and the guided workflow.</p></div></div>
        <Link to="/demo#roles" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Choose a demo role<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link>
      </section>
    </PublicLayout>
  );
}
