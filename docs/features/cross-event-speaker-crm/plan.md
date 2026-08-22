# Cross-Event Speaker CRM — Implementation Plan

## Phase 1: Authorization and data model

- [x] T001: Define organization owner/admin and event-limited projection rules with adversarial tests.
- [x] T002: Add merge tombstone/audit schema and cross-event indexes; deploy additive migration.
- [x] T003: Build paginated organization directory/detail projections without N+1 reads.

## Phase 2: Membership and merge lifecycle

- [x] T004: Implement event assignment/unlink while preserving contact/speaker history.
- [x] T005: Implement exact-email duplicate preflight, confirmation hash, transactional merge, audit,
  idempotency, and guarded reversal.
- [x] T006: Reconcile CRM imports so source sync respects canonical/merged identities and CRM fields.

## Phase 3: Frontend UI

### UI Spec

- **Location:** organization Contacts page; event Contacts links into it with `event=` filter.
- **Elements:** identity-only H1/subtitle; toolbar with search and styled event/stage/source filters
  left, Add/Import right; saved views and bulk actions in body toolbar; DataGrid/mobile rows; flex-
  sibling detail pane; merge confirmation dialog; loading skeletons, inline errors, and `Users` empty
  card with CTA.
- **Behavior:** URL preserves filters/selection; row opens pane and pushes content; assign/unlink
  refreshes memberships; merge shows affected references and requires confirmation; no native select,
  border/shadow card, overlay list modal, or header action.
- **Data:** organization directory/detail/segment/source/membership/merge functions.

### Tasks

- [x] T007: Add org route/navigation and event-filtered deep-link compatibility.
- [x] T008: Build directory, toolbars, URL state, pagination, mobile rows, and empty/error/loading states.
- [x] T009: Build detail pane, event assignment, timeline/source/readiness sections.
- [x] T010: Build duplicate preflight/merge/reverse UI with accessible confirmation/announcements.

## Phase 4: Verification

- [ ] T011: Test 10k pagination, cross-org/email isolation, merge/reverse, import races, and permissions.
- [ ] T012: Browser-test org owner, event-only admin, add/import/filter/detail/assign/merge/reverse,
  refresh, mobile, keyboard, light, and dark modes.
- [ ] T013: Run release gate and update feature index/proof only after deployment.

## Task Dependencies

Authorization/schema precede projections; projections precede UI; merge tests precede enablement.

## Verification Checklist

- [ ] All acceptance criteria and tenant boundaries pass.
- [ ] Merge is explicit, exact-email, audited, idempotent, and reversible.
- [ ] Page/header/toolbar/panel/dropdown/card/empty/error invariants pass.
