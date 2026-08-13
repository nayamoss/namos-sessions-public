# Public CFP Abuse Controls — Requirements

**Type:** Security  
**Status:** Planned  
**Priority:** Medium  
**Audit finding:** SEC-WEB-002

## Problem

The public CFP mutation creates persistent data and schedules email without any repository-visible throttling or bot proof. Random idempotency keys allow unlimited unique submissions.

## Requirements

- FR-001: Preserve anonymous CFP submission while limiting automated high-volume abuse.
- FR-002: Enforce rate limits at a server/edge boundary using IP plus form/email signals.
- FR-003: Verify a server-checkable anti-bot token for suspicious or all public submissions.
- FR-004: Keep legitimate retries idempotent and do not send duplicate confirmations.
- FR-005: Return a generic 429/verification error without leaking account or submission existence.
- NFR-001: Controls must be measurable, configurable, and usable with accessibility tools.

## Success criteria

- Normal incognito submission still succeeds.
- Burst and distributed test cases are throttled before database/email side effects.
- A replay with the same idempotency key produces one submission and one confirmation.

