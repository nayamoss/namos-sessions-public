# Event Workspace Switching — User Journey

**Feature:** #105  
**Status:** Done — authenticated journey passed
**Last updated:** 2026-08-13

This is the authoritative UI journey for planning, implementation review, and QA. Direct
Convex calls, database inspection, and hand-entered internal routes do not satisfy it.

## 1. User

The primary user is a returning organization owner who manages more than one conference.
The access-boundary portion also uses a second authenticated person who has an event-scoped
membership but no organization-wide owner or admin role.

## 2. Starting state

- The owner is signed in and has completed organizer onboarding.
- The owner has organization role `owner`.
- Event A exists and contains at least one submission form, one track, one communication
  template, and one submission. It also has at least one event-specific member.
- Event B does not exist yet.
- The second person has a verified email address but no row in the organization team.
- The app is running against the Convex backend; Airtable does not implement this RBAC boundary.

## 3. Entry point

The owner opens the app from its normal root URL. With multiple accessible events the app
opens the Events page. With exactly one accessible event it opens that event's Dashboard; the
owner can reach the Events page from the event switcher's **Manage events** item.

## 4. User journey steps

### Journey A — create, switch, and preserve the active workspace

1. The owner opens **Events** and sees cards for every event they can access. Each card shows
   the event name, dates, and status. The page toolbar contains status filters and **New event**.
2. The owner selects **New event**. A detail pane opens without replacing the Events page.
3. The owner enters Event B's name, URL slug, start date, and end date. They optionally select
   Event A under **Start with an existing team** and select **Create event**.
4. The app disables the create action while saving. On success, it closes the creation flow and
   opens `/events/{event-b-slug}/dashboard`. The sidebar switcher identifies Event B.
5. The owner navigates to Program and Configure pages. Every URL retains Event B's slug and
   every page reads Event B's data.
6. The owner opens the event switcher and selects Event A. The app keeps the current subpage
   when that route exists, replaces the slug with Event A's slug, and loads Event A's data.
7. The owner reloads the browser. Event A remains selected because the slug is part of the URL.
8. The owner copies the URL and opens it in another authenticated browser session. The same
   event and subpage open when that account has access.

### Journey B — grant event-only access and prove isolation

1. From Event A, the owner opens **Configure → Event team**.
2. The owner selects **Add member**, keeps **Invite by email**, enters the second person's
   verified email, chooses `Organizer` or `Reviewer`, and selects **Add member**.
3. The detail pane closes and the team list shows the email, role, and pending/active state.
4. Alternatively, the owner selects **Pull from event**, chooses another accessible event,
   checks one or more people, and selects **Add selected**. Those people appear in Event A's list.
5. The second person signs in normally and opens the app. Their Events page and switcher show
   Event A but not Event B.
6. The second person opens an Event A Program or Configure page and sees Event A's content.
7. The second person attempts to open a shared Event B admin URL. The app shows the unavailable
   event state and a link back to Events; it does not render Event B data.
8. The owner returns to Event A's team page and removes the second person after confirming the
   destructive alert. The person disappears from the list and loses Event A access.

### Journey C — manage the organization-wide team

1. The owner opens the organization menu above the event switcher and selects
   **Organization settings**.
2. The Team section lists every owner/admin with their email, role, and pending/active state.
3. The owner selects **Invite**, enters an email, chooses Owner or Admin, and submits.
4. The new person appears in the list. Because this is an organization role, they can access
   every event without separate event memberships.
5. An admin visiting the same page can see the list but cannot see Invite or Remove actions.

### Journey D — duplicate configuration without instance data

1. On Events, the owner selects **Duplicate** on Event A's card.
2. A detail pane opens with a proposed copy name and slug. The owner supplies unique values and
   dates, optionally enables **Copy event team**, and selects **Duplicate event**.
3. The app opens the duplicate's Dashboard. The duplicate appears in the switcher and Events.
4. The owner opens Submission Forms, tracks in Event Settings, and Communications and sees
   copies of Event A's configuration. Routing rules that targeted copied tracks target the new
   track records.
5. The owner opens Abstracts, Speakers, and Agenda and sees no copied submissions, speakers, or
   scheduled sessions.

## 5. Expected outcome

The owner can create, enter, switch, share, team, and duplicate event workspaces entirely from
the product interface. The selected workspace is explicit in the URL and visible in the
sidebar. Event-only people can see exactly their allowed events, while organization owners and
admins retain access to all events.

## 6. Visible success state

- The URL contains `/events/{selected-slug}/...`.
- The sidebar switcher shows the selected event name and a status dot.
- The Events page immediately includes a newly created or duplicated event card.
- Team pages immediately include added people and remove deleted people.
- The inaccessible-event view replaces protected content for a denied direct URL.
- The duplicate visibly contains copied forms, tracks, and communication templates while its
  operational pages show no instance records.

No console output, database row, or backend response alone counts as visible success.

## 7. Failure and recovery states

| Failure | What the user sees | Preservation and recovery |
|---|---|---|
| Missing name/slug or invalid date range | Inline error in the detail pane; save remains available after correction | Entered values remain; correct them and retry |
| Duplicate slug | Inline server error stating that the slug is already used | Other inputs remain; choose a unique slug and retry |
| Event list fails to load | Inline error and **Retry** | No event is guessed; retry reloads accessible events |
| Event creation or team-copy transaction fails | Inline creation error and no partially created event | Inputs remain; retry is safe because the Convex mutation is transactional |
| Duplicate mutation fails | Inline error in the duplicate pane | Inputs and copy-team choice remain; correct/retry |
| Add/remove member fails | Inline error on the team page or detail pane | Existing membership list remains; retry the action |
| Source team fails to load | Inline error; no people are silently copied | Choose the source again or retry later |
| Unknown or forbidden event slug | Event unavailable message and **Back to events** link | No protected content renders; choose an accessible event |
| Session expires | Clerk sign-in replaces the protected app | Sign in again; the slugged redirect URL returns to the intended event when access still exists |
| Refresh, back, or forward navigation | Browser history changes the slug/subpage normally | Event selection follows the URL rather than stale component state |

## 8. Persistence expectations

- Refresh preserves the selected event and subpage through the URL.
- Leaving and returning through Events or the switcher reloads persisted event data.
- Logout/login recomputes `listMine`; no event from a previous account remains selected by
  client-only state.
- A second browser session opening a shared URL resolves the same slug and enforces that
  session's permissions.
- Created events, copied configuration, and team changes survive application restart because
  they are persisted through Convex mutations.

## Frontend wiring trace

| User action | Interface and handler | Repository/backend | Visible result |
|---|---|---|---|
| Open event URL | `EventProvider` resolves `eventSlug` | `events.getBySlug` → indexed lookup → `assertEventAccess` | Event chrome/content or unavailable state |
| Switch event | `EventSwitcher.choose` preserves the current suffix and navigates | New provider route calls `events.getBySlug` | URL and switcher name change; routed content reloads |
| Create event | `EventEditor.save` | `events.save`; optional source-team copy occurs in the same Convex mutation | New event Dashboard opens |
| Duplicate event | `EventEditor.save` | `events.duplicate` copies config, remaps track routing, optionally copies members | Duplicate Dashboard opens |
| Invite event member | `InviteEventMember.submit` | `eventMembers.add` → `assertEventOrganizerAccess` | Person appears in Event team |
| Pull event members | `addSelected` | source `eventMembers.list`, then target `eventMembers.add` | Selected people appear in Event team |
| Remove event member | confirmed `confirmRemove` | `eventMembers.remove` | Person disappears from Event team |
| Manage organization team | `OrganizationSettings` invite/remove handlers | `organizers.add/remove` with owner enforcement | Organization Team list updates |

## QA status

Journeys A–D passed on 2026-08-13 in the Codex in-app browser against the configured Clerk and
development Convex environment. Test records were clearly prefixed `PR113`: Event B used slug
`pr113-browser-event-b-1358`, the duplicate used `pr113-event-a-duplicate-1405`, and the
event-only identity was `pr113.audit.20260813+clerk_test@example.com`.

The owner created Event B, switched Event A/B without losing the Abstracts suffix, reloaded and
opened a copied URL, invited then removed the event-only reviewer, and verified denied direct
Event A/Event B URLs rendered **Event unavailable** without protected data. Duplication preserved
8 forms, 3 tracks, the `Speaker reminder` communication template, and optional team membership;
the duplicate had no submissions, speakers, agenda items, or evaluations. Organization team
management passed for the owner, and an active admin saw the team read-only with no Invite or
Remove controls. Verification caught an admin onboarding redirect, an unscoped Abstracts field
query, raw Convex error framing, and a legacy membership-schema incompatibility; all were fixed
and the affected owner, admin, and reviewer flows passed on retest. Desktop, 390px, dark-mode,
reload persistence, console review, and the development Convex deployment were included.
