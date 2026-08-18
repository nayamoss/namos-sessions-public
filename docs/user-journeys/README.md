# Page user journeys

Every rendered Namos Sessions screen has a real, standalone journey document. Each journey defines
the user, starting state, numbered UI actions, visible success condition, and recovery behavior.
CRUD pages additionally cover create, read/list, update, destructive confirmation, persistence, and
failed-mutation recovery. A route that intentionally does not mutate data says so explicitly.

Update the mapped document in the same pull request as any material page or flow change. A new page
is not complete until its document exists and its browser acceptance path can be exercised.

## Access and workspace

| Page | Document |
|---|---|
| Sign in — `/sign-in` | [sign-in.md](pages/sign-in.md) |
| Sign up — `/sign-up` | [sign-up.md](pages/sign-up.md) |
| Onboarding — `/onboarding` | [onboarding.md](pages/onboarding.md) |
| Events — `/`, `/events` | [events.md](pages/events.md) |
| Organization settings — `/settings/organization` | [organization-settings.md](pages/organization-settings.md) |
| Dashboard — `/events/:eventSlug/dashboard` | [dashboard.md](pages/dashboard.md) |

## Program

| Page | Document |
|---|---|
| Submission forms | [submission-forms.md](pages/submission-forms.md) |
| Form builder | [submission-form-builder.md](pages/submission-form-builder.md) |
| Abstracts | [abstracts.md](pages/abstracts.md) |
| Speakers | [speakers.md](pages/speakers.md) |
| Sponsors | [sponsors.md](pages/sponsors.md) |
| Evaluation | [evaluation.md](pages/evaluation.md) |
| Agenda | [agenda.md](pages/agenda.md) |
| Readiness | [readiness.md](pages/readiness.md) |
| Operations Agent | [operations-agent.md](pages/operations-agent.md) |
| Availability | [availability.md](pages/availability.md) |
| Communications | [communications.md](pages/communications.md) |

## Administration

| Page | Document |
|---|---|
| Portal forms | [portal-forms-admin.md](pages/portal-forms-admin.md) |
| Organizer tasks | [portal-tasks-admin.md](pages/portal-tasks-admin.md) |
| Event settings | [event-settings.md](pages/event-settings.md) |
| Event team | [event-team.md](pages/event-team.md) |
| Library | [library.md](pages/library.md) |
| Task templates | [task-templates.md](pages/task-templates.md) |
| Integrations | [integrations.md](pages/integrations.md) |
| API keys | [api-keys.md](pages/api-keys.md) |
| Components | [components.md](pages/components.md) |
| Embeds list/new/editor | [embeds.md](pages/embeds.md) |

## Speaker portal

| Page | Document |
|---|---|
| Home | [portal-home.md](pages/portal-home.md) |
| Submissions | [portal-submissions.md](pages/portal-submissions.md) |
| New submission | [portal-new-submission.md](pages/portal-new-submission.md) |
| Submission editor | [portal-submission-edit.md](pages/portal-submission-edit.md) |
| Profile | [portal-profile.md](pages/portal-profile.md) |
| Availability | [portal-availability.md](pages/portal-availability.md) |
| Schedule | [portal-schedule.md](pages/portal-schedule.md) |
| Tasks | [portal-tasks.md](pages/portal-tasks.md) |
| Task form | [portal-task-form.md](pages/portal-task-form.md) |

## Public pages and safe navigation

| Page | Document |
|---|---|
| Public feed | [public-feed.md](pages/public-feed.md) |
| Public embed | [public-embed.md](pages/public-embed.md) |
| Public CFP | [public-cfp.md](pages/public-cfp.md) |
| API Docs | [api-docs.md](pages/api-docs.md) |
| Legacy redirects and unknown routes | [redirects-and-unknown-routes.md](pages/redirects-and-unknown-routes.md) |

## QA evidence required for every journey

1. Start from visible navigation or a documented public link—not a database or internal API call.
2. Check loading, empty, populated, error, permission, and relevant responsive states.
3. For mutations, use timestamped disposable data, reload/navigate away and back, and record cleanup.
4. Include validation, keyboard/focus behavior, and destructive confirmation where applicable.
5. Record screenshots or video timestamps, test identity, persistence outcome, and recovery result.
