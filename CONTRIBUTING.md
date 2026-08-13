# Contributing

Thank you for helping improve Namos Sessions.

## Before you start

- Search existing issues and discussions before opening a duplicate.
- Use Discussions for setup questions, early ideas, and open-ended design proposals.
- Use an issue form for reproducible bugs, scoped features, and documentation problems.
- Discuss substantial changes before investing in a large pull request.
- Report suspected vulnerabilities privately under [SECURITY.md](SECURITY.md).

## Local setup

Follow the [README local development instructions](README.md#local-development):

```bash
npm install
cp .env.example .env
npm run dev
```

This is a Convex-backed application. For full local functionality, contributors need their own
Convex development deployment and should run `npx convex dev` to configure and synchronize it.
Do not commit credentials or generated local environment files.
Use `.invalid` and `.test` domains for fixture email addresses; never use real attendee data.

Cloudflare Workers is the deployment target. Backend work belongs in Convex or, for edge-only
behavior, in Cloudflare Workers/Pages Functions.

Feature code uses the repository interface in `src/data`. Do not import Airtable clients or
`convex/react` directly into feature code. Keep the demo seeder internal, preserve event scoping,
and fail closed whenever an authorization mapping is unavailable.

## Product and UI conventions

Namos Sessions is calm, precise, and operational. Follow [PRODUCT.md](PRODUCT.md) and the existing
tokens and components rather than introducing a new visual identity.

- Keep page title rows for identity only; put actions, search, filters, tabs, and sorting below.
- Use the app's dropdown/listbox components instead of visible native `<select>` controls.
- Use contextual icons and never decorative sparkle or starburst icons.
- Include desktop and relevant narrow-viewport evidence for visible UI changes.

## Branches and pull requests

Create focused branches from `main`. Use the repository's established naming convention:

- `feature/NNN-short-description` for issue-backed features
- `fix/short-description` for fixes
- `docs/short-description` for documentation-only changes

Keep commits and pull requests scoped to one change, explain the motivation and behavior, link
the relevant issue, and include screenshots for visible UI changes.

Before opening a pull request, all of these commands must pass:

```bash
npm run typecheck
npm run test
npm run lint
npm run check
```

`npm run check` repeats typechecking and tests before creating a production build; running the
explicit lint command as well ensures the full contribution gate is covered.

## Pull-request expectations

Link the issue, explain the user problem and chosen approach, call out data or environment changes,
add tests for behavior changes, and keep unrelated work in separate pull requests. Maintainers may
ask for a large change to be split before review.
