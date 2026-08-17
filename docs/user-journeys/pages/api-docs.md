# API documentation

**Route:** `/api-docs`  
**User:** Anonymous developer or signed-in event administrator.

## Journey

1. The developer opens API Docs and reads endpoint, authentication, and example content without a login requirement.
2. They navigate documentation sections and copy an example without exposing any real credential.
3. Signed out, they see guidance to sign in and create an event API key; signed in, they see the event-aware Settings destination.
4. They follow the link, create a disposable key through the API Keys page, make an authorized test call, and revoke the key.
5. An unavailable endpoint or invalid key returns documented, safe error behavior.

## Success and recovery

This page is read-only by design. API key generation/revocation is documented in [API keys](./api-keys.md).
