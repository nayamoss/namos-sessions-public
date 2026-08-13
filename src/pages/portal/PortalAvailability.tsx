import { useEffect, useState } from "react";
import { AvailabilityEditor, type AvailabilityDraft } from "@/components/availability/AvailabilityEditor";
import { Button } from "@/components/ui/button";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { useRepo } from "@/data/repo";
import { usePortalIdentity } from "./PortalIdentity";

export function PortalAvailability() {
  const repo = useRepo();
  const { event, selectedSpeaker } = usePortalIdentity();
  const [value, setValue] = useState<AvailabilityDraft>({ unavailable: [] });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    let active = true;
    if (!event || !selectedSpeaker) { setValue({ unavailable: [] }); return () => { active = false; }; }
    setMessage(undefined);
    void repo.availability.list({ eventId: event.id, speakerId: selectedSpeaker.id }).then((records) => {
      const record = records.find((entry) => entry.speakerId === selectedSpeaker.id);
      if (active) setValue(record ? { unavailable: record.unavailable, notes: record.notes } : { unavailable: [] });
    }).catch(() => { if (active) setMessage("Availability could not be loaded."); });
    return () => { active = false; };
  }, [event, repo, selectedSpeaker]);

  if (!event || !selectedSpeaker) return null;
  const save = async () => {
    setSaving(true); setMessage(undefined);
    try {
      await repo.availability.upsert({ eventId: event.id, speakerId: selectedSpeaker.id, unavailable: value.unavailable, notes: value.notes?.trim() || undefined });
      setMessage("Availability saved.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not save availability."); }
    finally { setSaving(false); }
  };
  return <div className="space-y-4"><ContentToolbar ariaLabel="Availability actions" primaryAction={<Button type="button" variant="accent" size="default" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save availability"}</Button>} /><section className="space-y-5 rounded-lg bg-card p-4 sm:p-6"><h2 className="text-lg font-semibold">When are you unavailable?</h2><AvailabilityEditor startsAt={event.startDate} endsAt={event.endDate} timezone={event.timezone} value={value} onChange={(next) => { setValue(next); setMessage(undefined); }} idPrefix={`portal-availability-${selectedSpeaker.id}`} />{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}</section></div>;
}
