# Sponsor Management — User Journey

**Issue:** #104  
**Journey status:** Done — authenticated organizer walkthrough passed
**Last updated:** 2026-08-13

## 1. User

The primary user is an authenticated event organizer managing sponsors alongside the event's CFP and speaker operations. A public CFP submitter participates only in the fast-track portion of the journey and must never see internal sponsor records or routing configuration.

## 2. Starting State

- The organizer has completed onboarding and has access to a published event.
- Sponsor management is enabled in Event Settings (`events.sponsorsEnabled = true`).
- The event has an open public submission form containing a dropdown such as "Are you submitting on behalf of a sponsor?"
- At least one sponsor task template exists if the organizer intends to apply a template.
- The public submitter does not need organizer access and knows only the public CFP URL.
- Seeded demo data may be used for verification: Platinum/Gold/Community tiers, Convex/Resend/Open Source Collective sponsors, contacts, sponsor tasks, and a Workshop routing rule linked to Convex.

If sponsor management is disabled, the Sponsors navigation item is absent. Direct navigation to the page shows an explanation and a link to Event Settings instead of sponsor data.

## 3. Entry Point

The organizer selects **Program → Sponsors** in the event sidebar and arrives at:

`/events/:eventSlug/program/sponsors`

The page header identifies the page only. Search, tier filtering, **Add sponsor**, and **Manage tiers** are in the toolbar below it.

## 4. Journey Steps

### 1. Open the sponsor workspace

1. The organizer selects **Sponsors** in the Program navigation.
2. The app resolves the active event from the URL, confirms sponsor management is enabled, and requests `sponsors.list` and `sponsorTiers.list` through the repository layer.
3. Convex checks event access and reads event-scoped sponsors, tiers, contacts, and tasks.
4. The page replaces its loading skeleton with a list showing each sponsor's name, tier, status, primary contact, and open-task count.
5. If there are no sponsors, the organizer sees **No sponsors yet** and an **Add sponsor** action.

### 2. Create and organize tiers

1. The organizer selects **Manage tiers**; a flex-sibling detail pane opens without covering the sponsor list.
2. They enter a tier name and select **Add tier**.
3. The click handler calls the sponsor-tier repository, which invokes `sponsorTiers.create`.
4. Convex verifies event access, trims and validates the name, computes the event-local sort order, and inserts the tier.
5. The app reloads the tier data and the new row becomes visible in the pane.
6. The organizer may use the up/down controls; `sponsorTiers.reorder` persists the complete ordered tier-id list and the UI refreshes in that order.

### 3. Create a sponsor

1. The organizer closes the tier pane and selects **Add sponsor**.
2. In the flex-sibling pane they enter a required name, choose the styled Tier and Status dropdowns, and optionally enter a website and notes.
3. Selecting **Add sponsor** validates the trimmed name in the browser and calls `repo.sponsors.create`.
4. The Convex adapter invokes `sponsors.create`; the mutation checks event access and tier ownership, then inserts the event-scoped sponsor.
5. The list reloads, the new sponsor row appears, and its detail pane opens. This visible row and pane are the creation confirmation.

### 4. Add contacts and choose the primary contact

1. In the sponsor detail pane, the organizer selects **Add contact**.
2. They enter the contact's name and optional email, phone, and role, then may select **Set as primary contact**.
3. **Save contact** calls `sponsorContacts.create` through the repository and Convex adapter.
4. The mutation checks that the sponsor exists and is in an event the organizer can access. The first contact automatically becomes primary; explicitly choosing another primary clears the previous primary in the same mutation.
5. The detail pane and sponsor list reload. The contact card shows all entered fields and a **Primary** badge, while the sponsor row shows that contact's name and email.
6. Editing a different contact and setting it primary transfers the badge and list-row identity. Removing the primary contact promotes another remaining contact so the sponsor never has multiple primaries.

### 5. Track sponsor deliverables

1. Under **Deliverables**, the organizer either enters a one-off task and selects **Add**, or chooses a task template and selects **Apply**.
2. A one-off task calls `tasks.create` with `targetType: "sponsor"` and the sponsor id. A template calls `taskTemplates.applyToSponsor`.
3. Convex validates that the sponsor and template belong to the active event, then inserts sponsor-scoped records into the shared `onboarding_tasks` table. Template application skips existing equivalent tasks.
4. The pane reloads and displays the new checklist rows. Template application also reports how many tasks were added or skipped.
5. The same records are visible under **Portals → Tasks** when the organizer filters to Sponsor; task rows resolve and display the sponsor name.
6. Selecting a task's circle changes its shared task status to completed and refreshes both the detail count and list-row open-task count.

### 6. Configure sponsor fast-track routing

1. The organizer opens the event's submission form builder and its **Routing** section.
2. They create or edit a rule whose condition matches a public dropdown value, such as `Workshop` or `Yes — Convex`.
3. In **Link submission to sponsor**, they choose the intended sponsor. They may combine this with existing targets such as **Accept Queue**, a tag, track, or reviewer.
4. The routing editor stores `assignSponsorId` on that rule, and saving the form calls `forms.save` through the repository.
5. Convex validates that the sponsor belongs to the same event before persisting the routing rule. Existing routing targets remain unchanged.

### 7. Submit the public CFP response

1. A public submitter opens the CFP URL.
2. `publicForms.get` returns the public form projection. The submitter sees only the organizer-authored dropdown label and options; sponsor ids, sponsor records, tiers, contacts, and routing targets are absent.
3. The submitter chooses the matching option, completes required fields, reviews the response, and submits it.
4. The public form submit handler calls `publicForms.submit` with the response's opaque field values.
5. Convex revalidates the response, evaluates the persisted category-routing rules server-side, and inserts the submission with the matching `sponsorId`, status, tag, track, and reviewer effects.
6. The submitter sees the normal CFP success state. Nothing in that success state reveals internal sponsor configuration.

### 8. Confirm the organizer-visible outcome

1. The organizer returns to **Program → Sponsors** and opens the routed sponsor.
2. `sponsors.get` reads the sponsor and filters the event's submissions by that sponsor id.
3. Under **Linked submissions**, the organizer sees the new submission title and **Accept Queue** status.
4. Selecting the linked submission navigates to `/events/:eventSlug/program/abstracts?selected=:submissionId`.
5. The Abstracts page resolves the `selected` query parameter and opens that exact submission's detail pane, where the organizer can continue the normal review workflow.

## 5. Expected Outcome

The organizer can replace the operational sponsor spreadsheet for the v1 scope: sponsors are grouped into ordered tiers, each sponsor has usable contact ownership, sponsor deliverables live in the shared task system, and a matching public CFP submission is automatically linked to the intended sponsor and placed in the configured queue.

The public submitter completes the ordinary CFP experience and sees no internal sponsor data beyond the dropdown wording the organizer deliberately published.

## 6. Visible Success State

The journey is visibly successful when all of the following are observable in the running app:

- The Sponsors list shows the created sponsor, tier, status, primary contact, and correct open-task count.
- The sponsor detail pane shows all contacts with exactly one **Primary** badge.
- Applied deliverables appear both in sponsor detail and in the event-wide Tasks admin view.
- The form builder shows the sponsor selected on the matching routing rule after reopening the form.
- The sponsor detail pane lists the test CFP response under **Linked submissions** with **Accept Queue** status.
- The linked row opens the exact record in Abstracts.
- The public CFP page and success state reveal no sponsor id, tier, contact, sponsor list, or routing configuration.

## 7. Failure and Recovery States

- **Signed out or missing event access:** organizer queries and mutations are rejected by the existing access guard. The user must sign in with an account that can access the event; no sponsor data is returned.
- **Sponsor management disabled:** the navigation item is hidden. A direct URL shows the disabled explanation and links to Event Settings; enabling Sponsors and returning makes the workspace reachable.
- **Invalid sponsor or contact input:** blank required names produce inline errors and nothing is inserted. The entered form remains available for correction.
- **Cross-event tier, sponsor, template, or routing id:** Convex rejects the mutation. The pane/editor shows the returned error and keeps the current record unchanged.
- **Delete an assigned tier:** deletion is blocked with “Reassign or remove sponsors in this tier before deleting it.” The organizer can move those sponsors to another tier or no tier, then retry.
- **Primary-contact conflict:** choosing a new primary atomically clears the old primary. Attempting to unset the only primary is rejected until another contact is chosen; deleting it promotes another remaining contact.
- **Duplicate template tasks:** template application does not create duplicates and reports the added and skipped counts.
- **Network or server failure:** the current pane remains open and displays an inline error. The organizer can retry the same action without navigating away.
- **Refresh, Back, or direct link:** persisted records reload from Convex. The `selected` sponsor query parameter restores the selected detail pane; a linked abstract URL restores the exact abstract detail.
- **Sponsor removal:** a destructive confirmation explains the result. Confirming deletes contacts, removes the sponsor, and unassigns rather than deletes linked tasks and submissions. Cancel leaves all state unchanged.
- **No routing match:** the submission follows the existing default CFP path and has no sponsor link. The organizer can correct the condition or selected sponsor, save, and submit a fresh test response.
- **Closed or invalid public form:** the existing public CFP validation/closed states prevent submission; internal sponsor routing data remains server-only.

## 8. Persistence Expectations

- Sponsors, tiers, contacts, task assignments, task completion, and routing rules persist in Convex and remain after reload, navigation, and a new authenticated session.
- All sponsor-owned data is scoped by `eventId`; switching events never carries sponsor records or options across event workspaces.
- Public form routing is evaluated from the saved server-side rule at submission time, not from browser-held sponsor data.
- A routed submission retains its `sponsorId` until an organizer removes that sponsor. Sponsor removal clears the link but preserves the submission and its other routing outcomes.
- Deleting a tier never silently changes sponsor records; it is blocked until every assigned sponsor is moved.
- Contact-primary changes are persisted atomically so reload cannot expose two primary contacts.

## Verification Record

The exact journey passed on 2026-08-13 against the configured development Convex deployment and
Clerk instance. `PR113 Verified Sponsor` retained its tier, two contacts, changed primary contact,
three template tasks, completed task state, and persisted routing rule after reload and a fresh
organizer sign-in. A verified public submitter sent `PR113 Routed Workshop 1415` with Session
format `Workshop`; only the organizer-authored public option was visible, while the resulting
record was linked to the sponsor in `accept_queue`. Sponsor detail linked directly to the exact
selected Abstracts record. Deleting the in-use tier was blocked with the inline message
`Reassign or remove sponsors in this tier before deleting it.` and exposed no request id or
stack trace. Desktop, 390px, and dark-mode evidence plus the full session recording are stored
under `test-artifacts/e2e-real-user-20260813-135557/`.
