import {
  CalendarDays,
  GalleryVerticalEnd,
  Grid3X3,
  List,
  Rows3,
  type LucideIcon,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
import type { EmbedView } from "@/data/types";

interface EmbedTemplate {
  view: EmbedView;
  name: string;
  description: string;
  icon: LucideIcon;
}

export const EMBED_TEMPLATES: EmbedTemplate[] = [
  {
    view: "agenda",
    name: "Agenda",
    description: "A time-ordered agenda grouped by day and track.",
    icon: CalendarDays,
  },
  {
    view: "schedule_itinerary",
    name: "Schedule itinerary",
    description: "A searchable chronological schedule for attendees.",
    icon: Rows3,
  },
  {
    view: "schedule_grid",
    name: "Schedule grid",
    description: "A day-by-day timetable with rooms and time slots.",
    icon: Grid3X3,
  },
  {
    view: "session_list",
    name: "Session list",
    description: "A browsable catalog of published sessions.",
    icon: List,
  },
  {
    view: "speaker_gallery",
    name: "Speaker gallery",
    description: "A visual directory with speaker headshots and profiles.",
    icon: GalleryVerticalEnd,
  },
  {
    view: "speaker_list",
    name: "Speaker list",
    description: "A compact alphabetical speaker directory.",
    icon: Users,
  },
];

interface EmbedTemplateGalleryProps {
  onSelect: (template: EmbedTemplate) => void;
  onBlank: () => void;
  onCancel: () => void;
}

export function EmbedTemplateGallery({
  onSelect,
  onBlank,
  onCancel,
}: EmbedTemplateGalleryProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Choose an embed template</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a starting layout. You can change its fields, filters, and style before saving.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {EMBED_TEMPLATES.map((template) => {
          const Icon = template.icon;
          return (
            <button
              key={template.view}
              type="button"
              aria-label={`Use ${template.name} template`}
              onClick={() => onSelect(template)}
              className={cardSurfaceClasses(
                "default",
                "flex min-h-40 flex-col p-5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
            >
              <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
              <span className="mt-4 font-semibold">{template.name}</span>
              <span className="mt-1 text-sm leading-5 text-muted-foreground">
                {template.description}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          aria-label="Start from blank"
          onClick={onBlank}
          className={cardSurfaceClasses(
            "muted",
            "flex min-h-40 flex-col p-5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
        >
          <span className="font-semibold">Start from blank</span>
          <span className="mt-1 text-sm leading-5 text-muted-foreground">
            Open the editor with the standard agenda defaults.
          </span>
        </button>
      </div>
    </div>
  );
}
