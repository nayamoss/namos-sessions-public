import { useCallback, useEffect, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRepo } from "@/data/repo";
import type { Event, Tag, TagId } from "@/data/types";

export default function Library() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const [event, setEvent] = useState<Event>();
  const [tags, setTags] = useState<Tag[]>([]);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [savingId, setSavingId] = useState<TagId>();
  const [deleteCandidate, setDeleteCandidate] = useState<TagId>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const nextEvent = activeEvent;
      if (!nextEvent) {
        setEvent(undefined);
        setTags([]);
        setDraftNames({});
        return;
      }
      const nextTags = await repo.tags.list({ eventId: nextEvent.id });
      setEvent(nextEvent);
      setTags(nextTags);
      setDraftNames(
        Object.fromEntries(nextTags.map((tag) => [tag.id, tag.name])),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load tags.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeEvent, repo]);

  useEffect(() => {
    void load();
  }, [load]);

  const createTag = async () => {
    if (!event || !newName.trim()) return;
    setAdding(true);
    setError(undefined);
    try {
      await repo.tags.create({ eventId: event.id, name: newName });
      setNewName("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create the tag.",
      );
    } finally {
      setAdding(false);
    }
  };

  const renameTag = async (tag: Tag) => {
    if (!event) return;
    const name = draftNames[tag.id]?.trim();
    if (!name || name === tag.name) return;
    setSavingId(tag.id);
    setError(undefined);
    try {
      await repo.tags.rename({ eventId: event.id, id: tag.id, name });
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not rename the tag.",
      );
    } finally {
      setSavingId(undefined);
    }
  };

  const removeTag = async (tag: Tag) => {
    if (!event) return;
    setSavingId(tag.id);
    setError(undefined);
    try {
      await repo.tags.remove({ eventId: event.id, id: tag.id });
      setDeleteCandidate(undefined);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not delete the tag.",
      );
    } finally {
      setSavingId(undefined);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <ContentToolbar
          ariaLabel="Tag actions"
          primaryAction={
            <Button
              variant="accent"
              size="sm"
              onClick={() => document.getElementById("new-tag-name")?.focus()}
              disabled={!event || loading}
            >
              Add tag
            </Button>
          }
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <SkeletonList rows={4} label="Loading tags…" />
        ) : !event ? (
          <Card className="p-6">
            <p className="text-base text-muted-foreground">
              Create an event before adding tags.
            </p>
          </Card>
        ) : (
          <Card className="space-y-6 p-6">
            <div>
              <h2 className="text-base font-semibold">Tags</h2>
              <p className="mt-1 text-base text-muted-foreground">
                Create reusable tags to organize submissions for this event.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="new-tag-name">New tag</Label>
                <Input
                  id="new-tag-name"
                  value={newName}
                  maxLength={80}
                  placeholder="Tag name"
                  onChange={(change) => setNewName(change.target.value)}
                  onKeyDown={(key) => {
                    if (key.key === "Enter") void createTag();
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void createTag()}
                disabled={adding || !newName.trim()}
              >
                {adding ? "Adding…" : "Create"}
              </Button>
            </div>
            <div className="space-y-3">
              {tags.map((tag) => (
                <div key={tag.id} className={cardSurfaceClasses("default", "p-4")}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground"
                        style={
                          tag.color ? { backgroundColor: tag.color } : undefined
                        }
                        aria-hidden="true"
                      />
                      <Label className="sr-only" htmlFor={`tag-${tag.id}`}>
                        Tag name
                      </Label>
                      <Input
                        id={`tag-${tag.id}`}
                        value={draftNames[tag.id] ?? tag.name}
                        maxLength={80}
                        onChange={(change) =>
                          setDraftNames((current) => ({
                            ...current,
                            [tag.id]: change.target.value,
                          }))
                        }
                        onKeyDown={(key) => {
                          if (key.key === "Enter") void renameTag(tag);
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2 sm:shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void renameTag(tag)}
                        disabled={
                          savingId === tag.id ||
                          !draftNames[tag.id]?.trim() ||
                          draftNames[tag.id]?.trim() === tag.name
                        }
                      >
                        <Save className="mr-1.5 h-4 w-4" />
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteCandidate(tag.id)}
                        disabled={savingId === tag.id}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                  {deleteCandidate === tag.id && (
                    <div className={cardSurfaceClasses("default", "mt-3 flex flex-col gap-3 bg-muted/60 p-4 sm:flex-row sm:items-center sm:justify-between")}>
                      <p className="text-sm">
                        Delete “{tag.name}”? It will also be removed from
                        assigned submissions.
                      </p>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteCandidate(undefined)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => void removeTag(tag)}
                          disabled={savingId === tag.id}
                        >
                          {savingId === tag.id ? "Deleting…" : "Delete tag"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {!tags.length && (
                <EmptyState compact title="Create your first tag" message="Tags make submissions easier to group, route, filter, and assign to reviewers." action={<Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("new-tag-name")?.focus()}>Add a tag</Button>} />
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
