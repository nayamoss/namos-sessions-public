import { ClipboardCheck, Megaphone, Plus, Send, UserSearch } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { COMMAND_ROUTES, GO_TO_SEQUENCES } from "@/lib/shortcuts";
import { useOptionalCurrentEvent } from "@/components/EventContext";

const QUICK_ACTIONS = [
  // `value` is what cmdk matches against, so it carries the synonyms people
  // actually type ("cfp", "call for papers") for the label they see.
  { label: "Create a CFP", value: "create cfp call for papers new form", to: "/program/forms?new=true", icon: Megaphone },
  { label: "Add a submission", value: "create new abstract submission", to: "/program/abstracts?new=true", icon: Plus },
  { label: "Judge submissions", value: "review score judge evaluation", to: "/program/evaluation", icon: ClipboardCheck },
  { label: "Draft an email", value: "draft compose send email blast communication template", to: "/program/communications/templates/new/edit", icon: Send },
  { label: "Find a speaker", value: "find search speaker", to: "/program/speakers?focus=search", icon: UserSearch },
] as const;

const keyClassName = "rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const eventSlug = useOptionalCurrentEvent()?.event.slug;

  const selectDestination = (to: string) => {
    onOpenChange(false);
    const destination = eventSlug ? `/events/${eventSlug}${to}` : "/events";
    window.setTimeout(() => navigate(destination), 0);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      className="w-[calc(100vw-2rem)] max-w-[42rem] rounded-[12px] border-0 bg-popover shadow-none"
    >
      <CommandInput
        aria-label="Command palette"
        autoFocus
        placeholder="Jump to a page or run a command…"
      />
      <CommandList className="max-h-[min(32rem,calc(100dvh-10rem))] pb-2">
        <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
          No matches.
        </CommandEmpty>
        <CommandGroup heading="Quick actions">
          {QUICK_ACTIONS.map((item) => (
            <CommandItem key={item.to} value={item.value} onSelect={() => selectDestination(item.to)}>
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          {COMMAND_ROUTES.map((item) => {
            const sequence = GO_TO_SEQUENCES.find((candidate) => candidate.to === item.to);
            return (
            <CommandItem key={item.to} value={item.label} onSelect={() => selectDestination(item.to)}>
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
              {sequence && <span className="ml-auto flex items-center gap-1" aria-label={`Shortcut g ${sequence.key}`}>
                <kbd className={keyClassName}>g</kbd>
                <kbd className={keyClassName}>{sequence.key}</kbd>
              </span>}
            </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
