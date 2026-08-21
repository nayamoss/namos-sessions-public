# Cross-Event Speaker CRM — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)

- `crm_contacts`: organization, normalized email, name, eight-stage pipeline, score, timestamps.
- `crm_event_contacts`: event/contact and optional speaker link.
- `crm_stage_history`: organization/contact, stage/score, actor/time.
- `crm_segments`: organization filters with optional event/readiness criteria.
- `crm_sources`/`crm_source_records`: event-scoped imported identity provenance.
- `speakers.contactId`: optional link from event speaker record to organization contact.

### Required Changes

| Table | Action | Column/Index | Type | Notes |
| --- | --- | --- | --- | --- |
| `crm_contacts` | ADD | `mergedIntoContactId` | optional contact id | Reversible tombstone; excluded from default list. |
| `crm_contact_merges` | ADD TABLE | org/source/target/snapshot/actor/timestamps | Convex table | One audit row per merge/reversal. |
| `crm_contact_merges` | ADD INDEX | `by_organization_createdAt` | org/time | Audit and support. |
| `crm_event_contacts` | ADD INDEX | `by_contact_event` | contact/event | Efficient cross-event projection. |

### Migration

Deploy optional tombstone and new table/index. Existing contacts remain active. No automatic merge
backfill runs; duplicate candidates are derived and require explicit review.

---

## Backend / API

### Affected Existing Endpoints

N/A — extend Convex `crm.ts`, source functions, speaker linking, and repository adapters.

### New Endpoints

| Function | Request | Response |
| --- | --- | --- |
| `crm.listOrganizationDirectory` | org, cursor, filters | page + counts |
| `crm.getOrganizationContact` | org, contact | identity/events/history/sources/readiness |
| `crm.listDuplicateCandidates` | org, contact? | exact-email groups |
| `crm.mergeContacts` | org, source, target, confirmation hash | merge id/counts |
| `crm.reverseMerge` | org, mergeId | restored counts |
| `crm.assignEvents` | org, contact, eventIds | membership results |

### Validation & Business Logic

Authorization resolves organization owner/admin or intersects event-only access. Merge locks source/
target in one transaction, validates same org and exact normalized email, snapshots references,
repoints memberships/source records/speaker links, marks source merged, and records counts/hash.
Reverse succeeds only when current references still match the captured merge result.

---

## Frontend Components

### Modified Components

| File Path | Change |
| --- | --- |
| `src/pages/program/Contacts.tsx` | Become event-filtered entry/deep link or shared workspace shell. |
| app/org routing and sidebar | Add organization Contacts destination. |

### New Components

**OrganizationContactsPage**
- File: `src/pages/organization/Contacts.tsx`
- Props: route-owned.
- Location: organization workspace; identity-only header, toolbar below.
- Elements: search, event/stage/source saved-view styled filters left; Add/Import right; DataGrid;
  selected/bulk body toolbar; loading skeleton, inline error/retry, and `Users` empty card/CTA.
- Behavior: URL stores filters/contact; row opens flex-sibling detail; event deep links prefilter.

**OrganizationContactPane**
- File: `src/components/crm/OrganizationContactPane.tsx`
- Props: `{ organizationId; contactId; onClose; onChanged }`
- Elements: close, identity, stage/score, event memberships, speaker links, history timeline, sources,
  readiness summaries, edit/assign body actions, and permission-aware empty/error/loading states.

**DuplicateMergeDialog**
- File: `src/components/crm/DuplicateMergeDialog.tsx`
- Props: source/target/preflight/onConfirm.
- Elements: side-by-side identities, affected-reference counts, retained-value choices, confirmation,
  inline conflict error; no automatic default when records differ.

---

## State / Data Flow

Route/org context → paginated directory query → row → detail projection. Merge preflight → hash-bound
confirmed mutation → reactive directory/detail/history refresh. Event entry uses URL event filter.

---

## Auth / Permissions

Organization owner/admin sees full directory. Event-only admins receive only memberships for their
authorized events and cannot merge organization identities. Server projections perform filtering;
the browser never receives unauthorized contacts and then hides them.

---

## Edge Cases & Error States

Legacy contact without org/event link, same email across organizations, speaker linked elsewhere,
source sync during merge, already merged source, target tombstone, changed references before reverse,
large directory, empty event, revoked role, partial event assignment, and import mismatch fail safely.

---

## Technical Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Canonical identity | Organization contact | Event speakers keep event-specific records. |
| Merge | Exact email + explicit review | Avoids dangerous fuzzy identity collapse. |
| Delete | Tombstone + reversible audit | Preserves history and rollback. |
| UI | Org page with event filters | Makes cross-event context primary. |

## Dependencies

Organizations/roles, current CRM schema/imports, speaker links, readiness projections.

## Risks & Mitigations

Merge can corrupt references; use preview/hash, one transaction, snapshots, idempotency, and guarded
reverse. Directory leaks are prevented by server-side authorized projections and adversarial tests.
