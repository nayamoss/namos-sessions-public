# CFP organizer analytics matrix

This matrix separates acquisition telemetry from the first-party operational snapshot. It is based on the core CFP lifecycle (call setup, submissions, evaluation, speaker coordination, communications, and scheduling) described in the [Sessionize platform overview](https://sessionize.com/playbook/platform-overview), and assignment/completion distribution practices in the [OpenReview assignment guide](https://docs.openreview.net/how-to-guides/paper-matching-and-assignment/how-to-upload-assignments-with-python).

| Datapoint | Owner | Source | Current availability | Destination |
| --- | --- | --- | --- | --- |
| CFP open status | Organizer | Submission forms | Current state | First-party event snapshot |
| Submission starts | Growth | Public form lifecycle | Typed event | PostHog and GA4 conversion subset |
| Submission completions | Growth | Public submission outcome | Typed event | PostHog and GA4 conversion subset |
| Submission failure rate | Growth | Public submission outcome | Typed event | PostHog; GA4 failure conversion where configured |
| Undecided-submission count | Program chair | Submission statuses | Current state | First-party event snapshot |
| Acceptance rate | Program chair | Submission decisions | Current state | First-party event snapshot |
| Unassigned-review count | Review lead | Eligible submissions and assignments | Current state | First-party event snapshot |
| Review completion rate | Review lead | Assignments and completed evaluations | Current state | First-party event snapshot |
| Reviewer workload distribution | Review lead | Assignment counts per reviewer | Current state, aggregate only | First-party event snapshot |
| Speaker confirmation rate | Speaker lead | Speaker confirmation status | Current state | First-party event snapshot |
| Speaker-profile readiness | Speaker lead | Required speaker profile fields | Current state | First-party event snapshot |
| Accepted-session scheduling rate | Program lead | Accepted submissions and agenda entries | Current state | First-party event snapshot |
| Agenda-publication rate | Program lead | Agenda entries | Current state | First-party event snapshot |
| Communication delivery/failure rate | Operations | Communication log statuses | Current state | First-party event snapshot |
| Task completion/overdue rate | Operations | Onboarding tasks | Current state | First-party event snapshot |

## Guardrails

- Product acquisition and public-flow conversion analysis belongs to consent-gated GA4/PostHog. GA4 receives only explicitly cataloged high-level conversions.
- The organizer page carries only derived counts, rates, and anonymous workload buckets. It never receives contact names, email addresses, submission content, reviewer identity, or record IDs.
- Version one intentionally has no inferred historical trend. The `history` contract remains reserved for future first-party daily buckets.
- CRM pipeline counts are event-scoped operational state and remain first-party; they are not sent to product-analytics vendors.
