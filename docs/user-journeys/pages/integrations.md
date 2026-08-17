# Integrations

**Route:** `/events/:eventSlug/settings/integrations`  
**User:** Event owner/admin with disposable external credentials where a live test is authorized.

## Journey

1. The user opens Integrations and sees each provider's disconnected, configured, loading, and error states without exposed secrets.
2. They configure a disposable provider, enter invalid then valid credentials, test the connection, and save only after a successful review.
3. They reload and see Connected metadata—not the original secret—and can make a safe configuration edit.
4. For a sync provider, they preview eligible records, resolve a listed local-data blocker, execute only an approved disposable sync, and inspect itemized results.
5. They disconnect by completing the explicit confirmation; credentials disappear while the UI explains any retained history/remote records.

## Success and recovery

Connection/test failures retain non-secret fields, provide targeted recovery, and never leak credentials. See the detailed [Accelevents journey](../../features/accelevents-integration/USER_JOURNEY.md).
