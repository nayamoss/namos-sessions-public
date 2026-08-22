import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronsUpDown, ExternalLink, LayoutTemplate, Save, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { EmbedPreviewPanel } from "@/components/embeds/EmbedPreviewPanel";
import { EmbedTemplateGallery } from "@/components/embeds/EmbedTemplateGallery";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorInput } from "@/components/ui/color-input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { useRepo } from "@/data/repo";
import type { EmbedFieldOptions, EmbedId, EmbedWrite, Track } from "@/data/types";
import {
  defaultEmbed,
  defaultEmbedFields,
  embedWriteFromEmbed,
  embedViewDescriptions,
  embedViewLabels,
  embedViews,
  isHexColor,
  requiredEmbedFields,
} from "@/lib/public-embed";

const fieldLabels: Record<keyof EmbedFieldOptions, Record<string, string>> = {
  agenda: { title: "Title", time: "Time", room: "Room", track: "Track", speakers: "Speakers", recording: "Recording" },
  session: { title: "Title", time: "Time", room: "Room", track: "Track", speakers: "Speakers", recording: "Recording" },
  speaker: { name: "Name", headshot: "Headshot", bio: "Biography", links: "Profile links", sessions: "Published sessions" },
};

function snapshot(value: EmbedWrite) {
  return JSON.stringify({ ...value, trackIds: [...value.trackIds].sort() });
}

export default function EmbedEditorPage() {
  const { event } = useCurrentEvent();
  const { embedId } = useParams();
  const repo = useRepo();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [draft, setDraft] = useState<EmbedWrite>(() => defaultEmbed(event.id));
  const [saved, setSaved] = useState<EmbedWrite | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(Boolean(embedId));
  const [mode, setMode] = useState<"preview" | "code">("preview");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [choosingTemplate, setChoosingTemplate] = useState(!embedId);
  const [editorStarted, setEditorStarted] = useState(Boolean(embedId));

  const listRoute = `/events/${event.slug}/cms/embeds`;
  const load = useCallback(() => {
    setError("");
    void repo.events.listTracks({ eventId: event.id }).then(setTracks).catch(() => setTracks([]));
    if (!embedId) {
      const next = defaultEmbed(event.id);
      setDraft(next);
      setSaved(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void repo.publicEmbeds
      .getAdmin({ eventId: event.id, embedId: embedId as EmbedId })
      .then((embed) => {
        if (!embed) {
          setError("That embed was not found for this event.");
          return;
        }
        const next = embedWriteFromEmbed(embed);
        setDraft(next);
        setSaved(next);
      })
      .catch(() => setError("That embed was not found for this event."))
      .finally(() => setLoading(false));
  }, [embedId, event.id, repo]);
  useEffect(load, [load]);

  const dirty = useMemo(() => snapshot(draft) !== (saved ? snapshot(saved) : snapshot(defaultEmbed(event.id))), [draft, event.id, saved]);
  const nameError = draft.name.trim().length < 1 || draft.name.trim().length > 80;
  const colorError = !isHexColor(draft.primaryColor);
  const invalid = nameError || colorError;

  async function save() {
    if (invalid || saving) return;
    setSaving(true);
    setError("");
    try {
      const id = await repo.publicEmbeds.save(draft);
      const next = { ...draft, id, name: draft.name.trim() };
      setDraft(next);
      setSaved(next);
      navigate(`${listRoute}/${id}`, { replace: true });
      toast({ title: "Embed saved" });
    } catch {
      setError("Embed could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function updateFields(group: keyof EmbedFieldOptions, key: string, value: boolean) {
    setDraft((current) => ({
      ...current,
      fields: {
        ...current.fields,
        [group]: { ...current.fields[group], [key]: value },
      },
    }));
  }

  function toggleTrack(trackId: string) {
    setDraft((current) => ({
      ...current,
      trackIds: current.trackIds.includes(trackId)
        ? current.trackIds.filter((id) => id !== trackId)
        : [...current.trackIds, trackId],
    }));
  }

  const relevantGroups: Array<keyof EmbedFieldOptions> =
    draft.view === "agenda"
      ? ["agenda", "speaker"]
      : draft.view === "speaker_gallery" || draft.view === "speaker_list"
        ? ["speaker"]
        : ["session", "speaker"];

  if (loading) {
    return <AppLayout title="Embeds"><div className={cardSurfaceClasses("default", "h-96 animate-pulse bg-muted")} aria-label="Loading embed" /></AppLayout>;
  }

  if (!embedId && choosingTemplate) {
    return (
      <AppLayout title="New embed">
        <EmbedTemplateGallery
          onSelect={(template) => {
            setDraft({
              ...defaultEmbed(event.id),
              name: template.name,
              view: template.view,
            });
            setEditorStarted(true);
            setChoosingTemplate(false);
          }}
          onBlank={() => {
            setDraft(defaultEmbed(event.id));
            setEditorStarted(true);
            setChoosingTemplate(false);
          }}
          onCancel={() => editorStarted ? setChoosingTemplate(false) : navigate(listRoute)}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout title={saved?.name || "New embed"}>
      <div className="space-y-3">
        <ContentToolbar
          ariaLabel="Embed editor actions"
          utilities={
            <>
              <Button variant="ghost" size="sm" onClick={() => dirty ? setConfirmLeave(true) : navigate(listRoute)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              {!saved && (
                <Button variant="ghost" size="sm" onClick={() => setChoosingTemplate(true)}>
                  <LayoutTemplate className="mr-1 h-4 w-4" /> Templates
                </Button>
              )}
              {saved?.id && (
                <Button variant="ghost" size="sm" asChild>
                  <a href={`/embed/${saved.id}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1 h-4 w-4" /> Open public page
                  </a>
                </Button>
              )}
            </>
          }
          primaryAction={
            <Button variant="accent" size="sm" disabled={saving || invalid} onClick={() => void save()}>
              <Save className="mr-1 h-4 w-4" /> {saving ? "Saving…" : "Save"}
            </Button>
          }
        />
        <div className="min-h-5" aria-live="polite">
          {dirty && <p className="text-sm text-muted-foreground">Unsaved changes</p>}
        </div>
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

        <div className="grid min-h-[640px] gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
          <section className={cardSurfaceClasses("default", "bg-muted/40 px-4")} aria-label="Embed settings">
            <Accordion type="multiple" defaultValue={["type", "style", "filters", "fields"]}>
              <AccordionItem value="type">
                <AccordionTrigger>Type</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div>
                    <label htmlFor="embed-name" className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
                    <Input id="embed-name" className="mt-1" maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} aria-invalid={nameError} />
                    {nameError && <p className="mt-1 text-sm text-destructive">Enter an embed name.</p>}
                  </div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="embed-enabled" className="text-sm font-medium">Enabled</label>
                    <Switch id="embed-enabled" checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
                  </div>
                  <div>
                    <label htmlFor="embed-view" className="text-sm font-medium">View</label>
                    <Select value={draft.view} onValueChange={(view) => setDraft({ ...draft, view: view as EmbedWrite["view"] })}>
                      <SelectTrigger id="embed-view" className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{embedViews.map((view) => <SelectItem key={view} value={view}>{embedViewLabels[view]}</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">{embedViewDescriptions[draft.view]}</p>
                  </div>
                  <div className="rounded-md bg-background p-3">
                    <p className="text-sm font-medium">Styled HTML <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">Locked</span></p>
                    <p className="mt-1 text-xs text-muted-foreground">Responsive iframe that reads current published event data.</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="style">
                <AccordionTrigger>Style options</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div>
                    <label htmlFor="embed-theme" className="text-sm font-medium">Theme</label>
                    <Select value={draft.theme} onValueChange={(theme) => setDraft({ ...draft, theme: theme as EmbedWrite["theme"] })}>
                      <SelectTrigger id="embed-theme" className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem><SelectItem value="system">System</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Primary color</label>
                    <div className="mt-1"><ColorInput value={draft.primaryColor} onValueChange={(primaryColor) => setDraft({ ...draft, primaryColor })} /></div>
                    {colorError && <p className="mt-1 text-sm text-destructive">Use a six-digit hex color such as #E56B5D.</p>}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label htmlFor="embed-date-format" className="text-sm font-medium">Date format</label>
                      <Select value={draft.dateFormat} onValueChange={(dateFormat) => setDraft({ ...draft, dateFormat: dateFormat as EmbedWrite["dateFormat"] })}>
                        <SelectTrigger id="embed-date-format" className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="weekday_long">Monday, August 17</SelectItem><SelectItem value="weekday_short">Mon, Aug 17</SelectItem><SelectItem value="numeric">8/17</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label htmlFor="embed-time-format" className="text-sm font-medium">Time format</label>
                      <Select value={draft.timeFormat} onValueChange={(timeFormat) => setDraft({ ...draft, timeFormat: timeFormat as EmbedWrite["timeFormat"] })}>
                        <SelectTrigger id="embed-time-format" className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="12_hour">12 hour</SelectItem><SelectItem value="24_hour">24 hour</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="filters">
                <AccordionTrigger>Filters</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="secondary" role="combobox" className="w-full justify-between" aria-label="Choose tracks">
                        {draft.trackIds.length ? `${draft.trackIds.length} tracks selected` : "All tracks"}
                        <ChevronsUpDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="p-0">
                      <Command>
                        <CommandInput placeholder="Search tracks…" />
                        <CommandList>
                          <CommandEmpty>No tracks found.</CommandEmpty>
                          <CommandGroup>
                            {tracks.map((track) => {
                              const selected = draft.trackIds.includes(track.id);
                              return <CommandItem key={track.id} value={track.name} onSelect={() => toggleTrack(track.id)}><Check className={`mr-2 h-4 w-4 ${selected ? "opacity-100" : "opacity-0"}`} />{track.name}</CommandItem>;
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {draft.trackIds.length > 0 && <div className="flex flex-wrap gap-2">{draft.trackIds.map((trackId) => {
                    const track = tracks.find((item) => item.id === trackId);
                    return <Button key={trackId} type="button" variant="secondary" size="sm" onClick={() => toggleTrack(trackId)}>{track?.name ?? "Unknown track"}<X className="ml-1 h-3 w-3" /></Button>;
                  })}</div>}
                  <p className="text-xs text-muted-foreground">No selection includes every track.</p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="fields">
                <AccordionTrigger>Field options</AccordionTrigger>
                <AccordionContent className="space-y-4">
                  {relevantGroups.map((group) => (
                    <fieldset key={group}>
                      <legend className="mb-2 text-sm font-medium capitalize">{group}</legend>
                      <div className="space-y-2">
                        {Object.keys(defaultEmbedFields[group]).map((key) => {
                          const required = (requiredEmbedFields[group] as readonly string[]).includes(key);
                          const checked = draft.fields[group][key as keyof typeof draft.fields[typeof group]];
                          return <label key={key} className="flex items-center gap-2 text-sm"><Checkbox checked={checked} disabled={required} onCheckedChange={(value) => updateFields(group, key, Boolean(value))} /><span>{fieldLabels[group][key]}</span>{required && <span className="text-xs text-muted-foreground">Required</span>}</label>;
                        })}
                      </div>
                    </fieldset>
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>
          <EmbedPreviewPanel embedId={saved?.id} isDirty={dirty} draft={draft} event={event} mode={mode} onModeChange={setMode} />
        </div>

        {confirmLeave && (
          <section className={cardSurfaceClasses("default", "bg-muted p-4 text-sm")} aria-live="polite">
            <p>Leave without saving your changes?</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => navigate(listRoute)}>Leave without saving</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmLeave(false)}>Stay</Button>
            </div>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
