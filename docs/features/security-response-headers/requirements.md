# Web App Security Headers — Requirements

**Type:** Security  
**Status:** Planned  
**Priority:** Medium  
**Audit finding:** SEC-WEB-003

## Problem

The repository has no visible security-header policy for the Cloudflare Workers-hosted Vite application.

## Requirements

- FR-001: Apply security headers consistently to HTML and appropriate static responses.
- FR-002: Deploy an enforceable CSP that supports Clerk, Convex, storage, and local development without broad production wildcards.
- FR-003: Prevent unintended framing and MIME sniffing.
- FR-004: Set deliberate Referrer-Policy and Permissions-Policy values.
- FR-005: Verify runtime headers on the deployed origin, not only config syntax.

## Success criteria

- Production responses include the approved CSP, framing, nosniff, referrer, and permissions policies.
- Signed-in admin, speaker portal, public CFP, embeds, uploads, and API docs work without CSP violations that require weakening script policy.
