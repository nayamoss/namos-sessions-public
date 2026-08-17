# Public embeds administration

**Routes:** `/events/:eventSlug/cms/embeds`, `/events/:eventSlug/cms/embeds/new`, and `/events/:eventSlug/cms/embeds/:embedId`  
**User:** Authorized event organizer.

## Journey

1. The organizer opens Embeds and sees loading, empty, error, all/enabled/disabled, search, and card states.
2. They choose Add embed, enter a valid internal name, choose a view, enabled state, style, filters, and field options; the preview updates at desktop and mobile widths.
3. They save, receive a permanent editor route, open Get code, copy the iframe snippet, and paste it into a disposable host page.
4. They edit a saved embed and verify the public iframe reflects its configured public data after refresh.
5. They duplicate it and verify the copy is disabled; then disable the original and verify its public URL shows only unavailable, not event metadata.
6. They delete the disposable copy after canceling and then confirming the impact warning.

## Success and recovery

Invalid configuration preserves the draft and shows inline correction. Clipboard failure leaves selectable code. See the detailed [Public Embeds journey](../../features/public-embeds/USER_JOURNEY.md).
