# Cross-Event Speaker CRM — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-20

## Problem Statement

Namos stores organization contacts, event memberships, stage/score history, saved segments, and
Notion/Airtable sources, but the visible Contacts workflow is entered from one event. Organizers
cannot scan a person's cross-event history or safely resolve duplicates in one organization workspace.

## User Stories

**As an** organization owner **I want to** manage one speaker relationship across events **so that**
I do not rebuild the same directory for every conference.

**Acceptance Criteria:**
- GIVEN one contact linked to several events WHEN their detail opens THEN all authorized event
  participation and history are visible without duplicating the person.
- GIVEN an exact-email duplicate WHEN merged THEN the source is retained as a reversible audited
  tombstone and no speaker/event history is lost.

## Functional Requirements

- FR-001: Add organization route `/organizations/:organizationId/contacts` with search, styled
  filters, saved segments, event membership, stage, score, source, and outstanding-work columns.
- FR-002: Preserve event deep links that open the organization workspace filtered to that event.
- FR-003: Show identity, event participation, speaker records, stage/score history, source provenance,
  and authorized readiness/activity in a flex-sibling detail pane.
- FR-004: Assign/unlink event membership without deleting the organization contact or speaker.
- FR-005: Detect exact normalized-email duplicates and offer reviewed reversible merge; never fuzzy-
  merge automatically.
- FR-006: Repoint event memberships/source records/speaker links transactionally and record snapshots.
- FR-007: Enforce organization-owner/admin access; event-only admins see only contacts linked to
  authorized events.

## Non-Functional Requirements

- NFR-001: Paginate/index the organization directory for at least 10,000 contacts.
- NFR-002: Merge/reverse is idempotent, audited, and tenant-safe.
- NFR-003: Imported source identity cannot overwrite CRM-owned stage, score, or merge state.

## Out of Scope

- Outreach sequencing, dialer/SMS, deal forecasting, and automatic fuzzy/entity-resolution merges.

## Success Metrics

- Cross-event history and reversible exact-email merge pass with no orphaned references.
- Event-only admin isolation is proven server-side and in a real browser.
