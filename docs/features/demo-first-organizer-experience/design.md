# Demo-First Organizer Experience — Design

**Last Updated:** 2026-08-17
**Status:** Planned — not implemented

## Current layout (verified 2026-08-17)

```
AppLayout
└── flex row, overflow-hidden
    ├── Card  flex-1            ← agent composer: history bar, empty state ("What should we
    │                             work on?") or AgentTimeline, then the textarea with dictation,
    │                             voice, depth, and send
    └── div   w-72  shrink-0    ← program state, hidden when railCollapsed
        ├── RailSection "Start here"      (only when cfpCount === 0)
        ├── RailSection "Needs attention"
        ├── RailSection "Quick access"
        └── RailSection "Action items"
```

`railCollapsed` is `true` whenever `matchMedia("(max-width: 1024px)")` matches
(`DashboardHome.tsx:170-183`), and otherwise reads a persisted `localStorage` preference. Each
`RailSection` also persists its own open/closed state. The net effect: on a 13-inch laptop, or for
anyone who once collapsed anything, the event's operating state can be entirely absent on load.

## Target layout

```
AppLayout
└── flex column
    ├── ProgramStateHeader          ← NEW. Always visible. Not collapsible. Stacks at ≤768px
    └── flex row, overflow-hidden
        ├── Card flex-1            ← composer, unchanged
        └── div  w-72              ← rail, unchanged (still collapsible, still secondary)
```

The header is one `Card` containing a responsive row of figure groups. It is not a new surface
type, not a new component library, and introduces no border, divider, gradient, or shadow.

### Figure groups

| Group | Primary | Secondary | Links to |
|---|---|---|---|
| Submissions | `38 submissions` | `24 awaiting decision` | `/program/abstracts` and `/program/abstracts?status=awaiting` |
| Review | `60 / 84 reviews complete` | `2 reviewers behind` | `/program/evaluation` and `/program/evaluation?view=progress` |
| Schedule | `11 / 14 accepted scheduled` | `1 blocking conflict` | `/program/agenda` and `/program/agenda?view=conflicts` |
| Speakers | `43 outstanding tasks` | `6 overdue · 5 incomplete profiles` | `/portals/tasks`, `/portals/tasks?view=overdue`, `/program/speakers?view=profile-incomplete` |

`?view=profile-incomplete` and `?view=needs-attention` already exist (`DashboardHome.tsx:269,277`).
`?status=awaiting`, `?view=progress`, `?view=conflicts`, and `?view=overdue` are new query
parameters on existing pages — the agenda already stores its view in the URL
(`Agenda.tsx:299`), so `?view=conflicts` is likely already supported and should be verified rather
than added.

## Extraction — `src/lib/program-state.ts` (new)

`DashboardHome` currently computes these inline at `:237-289`. Extract to a pure function so the
derivation is unit-testable and the component stays a renderer:

```ts
export type ProgramStateInput = {
  submissions: Submission[] | undefined;   // undefined = not yet known. Preserved deliberately.
  agenda: AgendaItem[] | undefined;
  speakers: Speaker[] | undefined;
  tasks: OnboardingTask[] | undefined;
  comms: Comm[] | undefined;
  forms: SubmissionForm[] | undefined;
  assignments: EvaluationAssignment[] | undefined;
  evaluations: Evaluation[] | undefined;
  conflicts: AgendaConflict[] | undefined;
  now: number;
};

// `undefined` on a figure means "not yet known" and renders as such. `0` means a settled zero.
// Collapsing the two is the exact defect the comment at DashboardHome.tsx:209-215 documents.
export type ProgramStateFigure = {
  value: number | undefined;
  total?: number;
  label: string;      // accessible name, e.g. "24 submissions awaiting decision"
  to: string;
};

export function projectProgramState(input: ProgramStateInput): {
  submissions: ProgramStateFigure[];
  review: ProgramStateFigure[];
  schedule: ProgramStateFigure[];
  speakers: ProgramStateFigure[];
  pending: boolean;                 // any input still undefined
};
```

**NFR-002 tension to resolve.** Review completion needs assignments and evaluations, and blocking
conflicts need `agenda.detectConflicts` — three subscriptions `DashboardHome` does not currently
make. Options:

- **(a)** Add three subscriptions. Simple, but directly contradicts NFR-002 and worsens the
  subscription load on a transport that already stalls under heavy subscription sets (#211/#217).
- **(b)** Add one server-side rollup query, `dashboard.programState({ eventId })`, that computes
  everything in Convex and returns a small object. One subscription replaces six.
- **(c)** Ship review and conflict figures as links without counts in v1.

**Recommendation: (b).** It reduces the subscription count rather than increasing it, keeps the
derivation server-side where the joins are cheap, and makes the "as of" timestamp meaningful
because there is one thing to be as-of. The pure function still exists and is still unit-tested —
it just runs in Convex. `DashboardHome` keeps its existing six subscriptions for the rail; the
header uses the single rollup. **This is a decision the implementer should confirm with Naya before
building** (recorded as an addendum to D-5).

```ts
// convex/dashboard.ts (new)
export const programState = query({
  args: { eventId: v.id("events") },
  // assertEventAccess — organizers and reviewers both land here; reviewer-visible figures are the
  // same aggregate counts, which reveal nothing a reviewer cannot already see.
  // Returns { submissions: {...}, review: {...}, schedule: {...}, speakers: {...}, computedAt }
});
```

## Staleness and the "as of" indicator

`computedAt` comes from the server. The header renders `As of 14:07` and, when the value is older
than a threshold (proposed 120 seconds — twice the ~60s socket-drop interval described at
`DashboardHome.tsx:388-397`), switches to `Last confirmed 14:07 · refresh` with a manual refresh
action.

This is the honest answer to NFR-004: rather than claiming real-time or hiding the problem, the
surface states when it last had confirmed data and lets the user force a re-read.

## UI states

| State | Render |
|---|---|
| Loading (first paint) | Figure skeletons in place, layout stable — no reflow when values arrive |
| Resolved | Figures with labels and links |
| Partially resolved | Resolved figures render; unresolved ones read `—` with an accessible name of "not yet known" |
| Settled zero | `0` with normal styling. Distinct from `—` |
| All clear | "Nothing outstanding" in the secondary line; primary counts still shown |
| Stale (> threshold) | `Last confirmed <time>` plus refresh |
| Error | Header renders a single inline `role="alert"` and the composer below is unaffected |
| First run (`cfpCount === 0`) | Header replaced by the existing three setup steps — a wall of zeroes is worse than guidance |
| ≤768px | Groups stack vertically; no horizontal scroll; still not collapsible |

## What does not change

- The composer, its history popover, dictation, `VoiceChatButton`, `DepthSelect`, the send/stop
  control, and the `VOICE_TOGGLE_EVENT` / `SHORTCUTS.rightPanel` keyboard bindings.
- The rail, its collapse behaviour, and its per-section persistence.
- `AppLayout`, the sidebar, the event switcher, card surfaces, colours, and spacing tokens.
- The `access.data !== false` composer-visibility reasoning at `:388-397`, which is deliberate and
  well documented.

## Quick access

Add `{ icon: ClipboardCheck, label: "Readiness", to: \`/events/${event.slug}/program/readiness\` }`
to the `quickAccess` array (`DashboardHome.tsx:291-298`). One line; currently the strongest
judge-facing page in the product is unreachable from the landing page.

## The walkthrough document

`kill-my-saas-brief/USER_JOURNEY.md` is the judge walkthrough. This package's contribution is that
every one of its steps starts from this page and proceeds by clicking. After implementation, that
document is re-walked and each step annotated with what was actually observed.

## Risks

| Risk | Mitigation |
|---|---|
| Header pushes the composer below the fold | Header is a single compact row; measured at 1280px, 1024px, and 768px before merge |
| Rollup query becomes expensive on a 500-submission event | Phase 1 reduces the demo event's size (D-1); the rollup uses existing `by_event` indexes and returns counts only |
| Adding subscriptions worsens the known transport defect | Option (b) reduces them |
| A judge reads the header as marketing | Every figure is a link that lands on the underlying records — the fastest possible rebuttal |
| Scope creep into a dashboard redesign | Explicitly out of scope; this is one header plus one quick-access entry |
</content>
