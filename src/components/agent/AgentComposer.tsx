import type { ReactNode } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function AgentComposer({ value, onChange, onSubmit, mode, disabled, error, className, controls }: { value: string; onChange(value: string): void; onSubmit(): void; mode: "new" | "reply"; disabled: boolean; error?: string; className?: string; controls?: ReactNode }) {
  const invalid = !value.trim() || value.length > 4000;
  return <section className={cn("shrink-0 bg-card p-3", className)}>
    <Card variant="muted" className="overflow-hidden rounded-xl">
      <div className="transition-colors focus-within:bg-muted">
        <div className="px-4 pb-2 pt-3.5">
          <Label htmlFor="agent-composer" className="sr-only">{mode === "reply" ? "Reply to continue" : "Ask the agent"}</Label>
          <Textarea
            id="agent-composer"
            rows={1}
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              event.target.style.height = "auto";
              event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!disabled && !invalid) onSubmit();
              }
            }}
            className="max-h-[160px] min-h-7 resize-none rounded-none bg-transparent px-0 py-0 leading-6 shadow-none placeholder:text-muted-foreground focus-visible:bg-transparent focus-visible:ring-0"
            placeholder={mode === "reply" ? "Answer the agent’s question" : "Ask anything about this event"}
            disabled={disabled}
          />
        </div>
        <div className="flex min-h-10 items-end justify-between gap-3 px-2.5 pb-2.5">
          <div className="min-w-0 px-1">
            {error ? <p role="alert" className="truncate text-xs text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">Enter to send · Shift+Enter for a new line</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {controls}
            <Button
              type="button"
              size="icon"
              onClick={onSubmit}
              disabled={disabled || invalid}
              aria-label={mode === "reply" ? "Send answer" : "Send request"}
              title={mode === "reply" ? "Send answer" : "Send request"}
              className="compact-hit-target h-8 w-8 rounded-full bg-foreground text-background hover:bg-foreground/85 disabled:opacity-25"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  </section>;
}
