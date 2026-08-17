# Communications

**Route:** `/events/:eventSlug/program/communications`  
**User:** Authorized organizer with a configured disposable delivery provider for send tests.

## Journey

1. The organizer opens Communications and reads loading/empty/error/template/send-log states.
2. They create, edit, duplicate, and delete a disposable template with required validation and confirmation.
3. They preview token resolution for a selected speaker/session and correct unknown or invalid content.
4. They choose a decision/reminder/calendar action, review recipients and attachments, then confirm a test send only with explicit test credentials.
5. They inspect the send log, retry an itemized failed recipient, and confirm successful/failed records persist after reload.

## Success and recovery

No production email is sent during routine QA. Failed sends preserve the template and expose a targeted retry. See the full [Communications journey](../../features/comms-notifications/USER_JOURNEY.md).
