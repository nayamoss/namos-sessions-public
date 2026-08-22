import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { ToggleField } from "@/components/shared/ToggleField";
import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
import { useRepo } from "@/data/repo";
import type { Event } from "@/data/types";

type Category = NonNullable<Event["readinessCategories"]>[number];
const categories: Array<{ id: Category; label: string }> = [
  { id: "agenda_conflicts", label: "Schedule conflicts" },
  { id: "speaker_confirmations", label: "Speaker confirmations" },
  { id: "onboarding_tasks", label: "Onboarding tasks" },
  { id: "proposal_decisions", label: "Submission decisions" },
  { id: "comms_delivery", label: "Communication delivery" },
  { id: "recording_coverage", label: "Recording coverage" },
];

export default function ReadinessSettings() {
  const repo = useRepo();
  const { event } = useCurrentEvent();
  const navigate = useNavigate();
  const initial = useMemo(() => event.readinessCategories ?? categories.map((item) => item.id), [event.readinessCategories]);
  const [enabled, setEnabled] = useState<Category[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const save = async () => {
    setSaving(true); setError(undefined);
    try {
      await repo.events.save({ ...event, readinessCategories: enabled });
      navigate(`/events/${event.slug}/program/readiness`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save readiness settings.");
    } finally { setSaving(false); }
  };
  return (
    <div className="space-y-4">
      <ContentToolbar ariaLabel="Readiness settings actions" utilities={<Button variant="outline" size="sm" onClick={() => navigate(`/events/${event.slug}/program/readiness`)}>Cancel</Button>} primaryAction={<Button variant="accent" size="sm" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <section className={cardSurfaceClasses("default", "grid gap-4 p-6 sm:grid-cols-2")}>
        {categories.map((category) => (
          <ToggleField key={category.id} label={category.label} checked={enabled.includes(category.id)} onCheckedChange={(checked) => setEnabled((current) => checked ? [...new Set([...current, category.id])] : current.filter((id) => id !== category.id))} />
        ))}
      </section>
    </div>
  );
}
