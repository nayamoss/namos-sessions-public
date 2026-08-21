# AI Agenda Optimization — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)

- `events`: event identity, dates/timezone/settings; no agenda revision counter today.
- `agenda_items`: event, optional submission, room/track, start/end, speakers, publication and audit
  metadata through `agenda_items_audit`.
- `agent_action_proposals`: #262 basic agent proposals; statuses and payload hash, but no immutable
  multi-candidate before/after model or agenda revision binding.

### Required Changes

| Table | Action | Column/Index | Type | Notes |
| --- | --- | --- | --- | --- |
| `events` | ADD | `agendaRevision` | optional number | Backfill zero; increment on every agenda write. |
| `agenda_schedule_proposals` | ADD TABLE | proposal fields | Convex table | Event/run, base revision, candidates, selected candidate, hash, report, expiry, status, snapshots. |
| `agenda_schedule_proposals` | ADD INDEX | `by_event_status` | eventId/status | Manager and stale cleanup. |

Candidate assignment objects contain only known agenda/submission/room/track IDs and integer epoch
times. Before-state snapshots are bounded to rows changed by that candidate.

### Migration

Add optional `agendaRevision`, deploy compatible readers, backfill existing events to zero, then
make every create/update/delete/publish path increment it in the same mutation as the agenda write.
No agenda row is rewritten.

---

## Backend / API

### Affected Existing Endpoints

N/A — organizer operations use Convex functions, not REST routes. Extend `convex/agenda.ts`,
`agendaAudit.ts`, agent proposal tools, and all agenda write call sites.

### New Endpoints

| Function | Request | Response |
| --- | --- | --- |
| `agendaPlanner.createProposal` | eventId, objective, locks, weights | proposal id/status |
| `agendaPlanner.getProposal` | eventId, proposalId | candidates, diffs, report |
| `agendaPlanner.selectCandidate` | eventId, proposalId, candidateId | updated proposal |
| `agendaPlanner.applyProposal` | eventId, proposalId, payloadHash | applied revision/audit ids |
| `agendaPlanner.rejectProposal` | eventId, proposalId, reason? | rejected status |
| `agendaPlanner.rollbackProposal` | eventId, proposalId | restored revision/audit ids |

### Validation & Business Logic

Build a bounded DTO; enumerate deterministic slots; solve hard constraints first; score soft goals;
validate every candidate again before persistence and apply. Approval verifies organizer access,
event ownership, expiry, selected hash, base revision, and unchanged affected rows in one mutation.

---

## Frontend Components

### Modified Components

| File Path | Change |
| --- | --- |
| `src/pages/program/Agenda.tsx` | Add toolbar entry and proposal workspace state. |
| `src/components/agent/AgentRunInspector.tsx` | Link basic #262 proposal to advanced comparison. |

### New Components

**AgendaPlannerWorkspace**
- File: `src/components/agenda/AgendaPlannerWorkspace.tsx`
- Props: `{ eventId: string; proposalId?: string; onApplied(): void; onClose(): void }`
- Location: Agenda content area as a flex sibling/detail workspace, never overlaying the grid.
- Elements: objective styled listbox, soft-weight controls, lock selector, generate button, progress,
  candidate tabs containing labels only, score/constraint summaries, changed-session rows, unresolved
  card, stale/error banners, reject/apply buttons in a body toolbar, and empty/loading states.
- Behavior: generation preserves input after failure; candidate selection updates diff; apply opens an
  explicit confirmation dialog; rollback appears only when safe.
- Third-party: existing app primitives; optimization module is deterministic TypeScript.

**AgendaProposalDiff**
- File: `src/components/agenda/AgendaProposalDiff.tsx`
- Props: `{ rows: AgendaProposalDiffRow[] }`
- Elements: session, locked state, before room/time, after room/time, reason, warning; mobile stacked row.

---

## State / Data Flow

Convex event-scoped DTO → deterministic candidate generator → optional model ranking/explanation →
immutable proposal row → reactive UI diff → confirmed apply mutation → agenda rows/audit/revision →
Agenda refresh. Provider failure retains deterministic candidates.

---

## Auth / Permissions

Only event owners/admin organizers create, view, apply, reject, or rollback. Reviewers/speakers have
no proposal access. Every function verifies proposal/event/organization relationships server-side.

---

## Edge Cases & Error States

No rooms/operating hours, impossible capacity, multi-speaker availability, DST, locked invalid rows,
solver timeout, model failure, agenda changed, expired proposal, partial candidate, concurrent apply,
and unsafe rollback all receive explicit non-mutating states.

---

## Technical Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Constraint authority | Deterministic code | Model prose cannot guarantee correctness. |
| Apply | Revision/hash-bound transaction | Prevents stale or substituted writes. |
| AI role | Rank/explain candidates | Preserves agent value without inventing assignments. |

## Dependencies

#262 basic proposals, existing agenda conflict logic/audit, Operations Agent, and green release.

## Risks & Mitigations

Combinatorial growth is bounded by time/candidate limits and deterministic heuristics. Revision gaps
are prevented by centralizing all agenda writes behind one helper before enabling apply.
