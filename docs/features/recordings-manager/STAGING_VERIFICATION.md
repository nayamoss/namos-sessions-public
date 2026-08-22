# Recordings Manager — Staging Verification Runbook

This runbook is the release gate for the provider-neutral v1. Do not mark the feature complete
until every required check below has evidence from an authenticated preview deployment.

## Safe deployment boundary

1. Use a clean worktree containing only the reviewed Recordings Manager change set. Do not deploy
   from the shared dirty checkout: its build includes unrelated uncommitted changes.
2. Create a Convex preview deployment with an authorized preview deploy key. Keep its URL and data
   isolated from production.
3. Deploy the frontend to a staging origin that is allowed by the same Clerk instance used by the
   preview deployment. Confirm both `VITE_CONVEX_URL` and Clerk's JWT issuer point at the preview
   environment before signing in.
4. Seed the lifecycle fixtures and record their event ID, agenda-item IDs, and recording IDs.

## Migration rehearsal

Before migration, capture the count of agenda items with `videoUrl`, grouped into valid HTTPS,
invalid/non-HTTPS, and no value. Capture the count of existing rows whose
`legacySource === "agenda_video_url"`.

1. Run `recordings.migrateLegacy` for the fixture event.
2. Record `created`, `skipped`, `invalid`, and the returned exceptions.
3. Verify every created recording is hosted, draft, `legacySource: "agenda_video_url"`, and has
   preserved the original `agenda_items.videoUrl` field.
4. Verify non-HTTPS and malformed values remain unchanged on the agenda item and appear only in
   exceptions.
5. Run the mutation a second time. It must return `created: 0`; the prior valid rows must be
   counted as skipped and no duplicate session recording may exist.

## Authenticated browser evidence

Use an organizer in the staging event. Capture a screenshot or recording for each numbered
section of [USER_JOURNEY.md](./USER_JOURNEY.md), at desktop and 390px, in light and dark mode.

The minimum mutation sequence is:

1. Upload a small MP4, observe determinate progress, preview it, and confirm it remains a draft.
2. Attach a YouTube URL and a Vimeo URL; confirm only allowlisted sanitized embeds are rendered.
   Attach an S3/CloudFront or arbitrary HTTPS URL and confirm it is an external new-tab link.
3. Confirm HTTP, malformed, credentialed, unsupported-type, and oversized inputs fail closed.
4. Confirm pre-session publishing requires a non-empty override reason and produces a
   `published_early` activity entry.
5. Publish an eligible post-session recording. Verify attendee and an embed with `recording`
   enabled show it; verify a draft does not.
6. Stage and promote a replacement. Verify the original stays public until promotion, then becomes
   retained replaced history rather than disappearing.
7. Run mixed-result bulk publish and bulk unpublish, recording each row outcome.
8. Verify Readiness and Control Room coverage deep links for both missing and unavailable states.

## Final commands

Run these from the clean preview worktree and attach outputs to the release handoff:

```bash
npm run typecheck
npm run lint
npm run test:convex -- --run convex/recordings.test.ts
npm test -- --run src/test/recordings-page.test.tsx src/test/public-embed.test.ts src/test/program-control-room.test.tsx
npm test
npm run build
```

Full-suite failures must be fixed or explicitly shown to be unrelated before closing the release.
