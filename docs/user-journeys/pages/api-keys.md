# API keys

**Route:** `/events/:eventSlug/settings/api`  
**User:** Authorized event owner/admin.

## Journey

1. The user opens API keys and sees loading, empty, error, and existing-key metadata states; no secret is pre-rendered.
2. They create a disposable key, supply any required label/scope, and confirm the key is revealed exactly once.
3. They copy it, dismiss the reveal, refresh, and confirm only safe metadata remains visible.
4. They use the key against the documented disposable endpoint if authorized, then return to revoke it.
5. They cancel revocation once, confirm it, and verify subsequent use fails and the row status updates after refresh.

## Success and recovery

Key generation and revoke failure messages never disclose secret material. Regeneration is explicit; no old key is silently replaced.
