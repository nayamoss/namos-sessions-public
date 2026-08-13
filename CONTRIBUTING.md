# Contributing

Thank you for helping improve Namos Sessions.

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

Cloudflare Workers is the deployment target. Backend work belongs in Convex or, for edge-only
behavior, in Cloudflare Workers/Pages Functions.

## Branches and pull requests

Create focused branches from `main`. Use the repository's established naming convention:

- `feature/NNN-short-description` for issue-backed features
- `fix/short-description` for fixes

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
