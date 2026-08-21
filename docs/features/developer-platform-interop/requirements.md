# Developer Platform Interoperability — Requirements

**Type:** Improvement
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-20

## Problem Statement

Issue #178 shipped scoped tokens, REST reads, one submission-status write, SDK, CLI, and stdio MCP.
The surface is not generated from one discoverable contract and remote agents cannot use a hosted
MCP endpoint. Safe operational writes are narrower than the actual confirmation-based product model.

## User Stories

**As an** integrator **I want to** discover and call a versioned API consistently **so that** REST,
SDK, CLI, and agents behave the same.

**Acceptance Criteria:**
- GIVEN one scoped token WHEN equivalent operations run through every client THEN allow/deny,
  validation, idempotency, response, and audit outcomes match.
- GIVEN an invalid Origin or revoked token WHEN HTTP MCP connects THEN it fails closed.

## Functional Requirements

- FR-001: Define one typed route registry and emit an OpenAPI 3.1 description from it.
- FR-002: Publish `/api/v1/openapi.json` and render `/api-docs` from the same contract.
- FR-003: Add scoped, idempotent writes for speaker-task status, communication draft creation, and
  agenda-proposal approval. No direct send, publish, delete, or arbitrary agenda-write operation.
- FR-004: Extend SDK/CLI/MCP from the same types and scopes.
- FR-005: Host MCP at one Streamable HTTP endpoint supporting POST/GET with authentication, Origin
  validation, rate limiting, audit logging, and revocation parity.
- FR-006: Advertise only capabilities permitted by the current token.
- FR-007: Keep signed outbound event delivery in #96; do not duplicate webhook infrastructure.

## Non-Functional Requirements

- NFR-001: OpenAPI validation and contract tests fail CI on documented/runtime drift.
- NFR-002: Every write has idempotency, tenant checks, bounded input, and audit attribution.
- NFR-003: HTTP MCP follows the current protocol transport and security requirements.

## Out of Scope

- OAuth app marketplace, arbitrary SQL/query access, direct email send, automatic agenda publication.

## Success Metrics

- One conformance suite passes against REST, SDK, CLI, stdio MCP, and HTTP MCP.
- Invalid Origin/token/scope/idempotency attempts fail with consistent audited errors.
