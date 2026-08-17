# Design system

## Banded schedule grid

Use the **Banded schedule grid** when a time-by-room or time-by-person grid needs
clear structure without borders or dividers. The grid is separated by alternating
surface fills: each hour receives a muted band, while the intervening time slots
remain on the card surface. A small grid gap separates room columns.

The pattern is used by the Schedule Rooms view in `src/pages/program/Agenda.tsx`:

```tsx
<div className="grid auto-rows-[28px] gap-x-px overflow-hidden rounded-md bg-muted/60 text-sm">
  <div className="flex items-start gap-1.5 bg-muted/60 px-3 pt-1 text-sm font-semibold text-foreground">
    {/* hour label */}
  </div>
  <div className="min-h-7 bg-muted/60 transition-colors hover:bg-muted/80" />
  <div className="min-h-7 bg-card transition-colors hover:bg-muted/40" />
</div>
```

- Hour cells and their time labels use `bg-muted/60`.
- Non-hour cells use `bg-card`.
- Keep the existing `gap-x-px`; it creates room-column separation through the
  underlying `bg-muted/60`, rather than a border or divider.
- Do not replace these fills with `border-*`, `divide-*`, outlines, or shadows.
