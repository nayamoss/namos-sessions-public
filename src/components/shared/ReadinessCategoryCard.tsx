import { CheckCircle2, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReadinessItem } from "@/lib/readiness";

export function ReadinessCategoryCard({ label, icon: Icon, items, notDateSpecificCount = 0, loadError }: { label: string; icon: LucideIcon; items: ReadinessItem[]; notDateSpecificCount?: number; loadError?: string }) {
  return <section className="rounded-lg bg-muted/60 p-5" aria-label={label}>
    <div className="flex items-center gap-2"><Icon className="h-4 w-4" aria-hidden="true" /><h2 className="font-semibold">{label}</h2><span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span></div>
    {loadError && <p role="alert" className="mt-3 text-sm text-destructive">{loadError}</p>}
    {items.length ? <ul className="mt-3 space-y-1">{items.map(item => <li key={item.id}><Link to={item.to} className="block rounded-md px-2 py-2.5 outline-none hover:bg-background/70 focus-visible:ring-2 focus-visible:ring-ring/35"><p className="text-sm font-medium">{item.title}</p>{item.detail && <p className="mt-0.5 text-sm text-muted-foreground">{item.detail}</p>}</Link></li>)}</ul> : !loadError && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Nothing outstanding here.</p>}
    {notDateSpecificCount > 0 && <p className="mt-3 text-xs text-muted-foreground">+{notDateSpecificCount} more not tied to a specific day. <a className="font-medium underline" href="#readiness-day-all">Show all</a></p>}
  </section>;
}
