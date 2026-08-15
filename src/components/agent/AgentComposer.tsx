import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function AgentComposer({ value, onChange, onSubmit, mode, disabled, error }: { value: string; onChange(value: string): void; onSubmit(): void; mode: "new" | "reply"; disabled: boolean; error?: string }) {
  const invalid = !value.trim() || value.length > 4000;
  return <section className={cardSurfaceClasses("default", "space-y-2 bg-muted/60 p-4")}>
    <div className="flex items-center justify-between gap-3"><Label htmlFor="agent-composer">{mode === "reply" ? "Reply to continue" : "Objective"}</Label><span className="text-xs text-muted-foreground">{value.length}/4,000</span></div>
    <Textarea id="agent-composer" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!disabled && !invalid) onSubmit(); } }} className="min-h-[96px] resize-y bg-background" placeholder={mode === "reply" ? "Answer the agent's question" : "What should the Operations Agent investigate?"} disabled={disabled} />
    <div className="flex items-start justify-between gap-3"><div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<p className="text-xs text-muted-foreground">Enter submits. Shift+Enter adds a new line.</p></div><Button variant="accent" size="sm" onClick={onSubmit} disabled={disabled || invalid}><Send className="h-4 w-4" />{mode === "reply" ? "Continue" : "Run"}</Button></div>
  </section>;
}
import { cardSurfaceClasses } from "@/components/ui/card";
