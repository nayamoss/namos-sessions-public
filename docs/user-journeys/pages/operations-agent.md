# Operations Agent

**Route:** `/events/:eventSlug/program/agent`  
**User:** Event organizer with Operations Agent permission and configured AI credentials.

## Journey

1. The organizer opens Operations Agent and sees suggested objectives, source-linked data, configuration state, and a safe unavailable state when credentials are absent.
2. They choose or enter a bounded objective, start one run, and watch queued/running progress without duplicate starts on refresh.
3. They handle a clarification request or failure, supply only requested context, and retry when appropriate.
4. They inspect generated evidence and proposed changes, reject one proposal, then approve a second with the exact visible approval gate.
5. They confirm only approved event-scoped tasks are created and they appear in the owning task views after reload.

## Success and recovery

The agent never silently sends mail, publishes agenda, changes decisions, deletes data, or crosses events. See the full [Agent journey](../../features/agent-native-operations/USER_JOURNEY.md).
