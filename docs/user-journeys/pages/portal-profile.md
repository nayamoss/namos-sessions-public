# Speaker profile

**Route:** `/portal/profile`  
**User:** Authenticated speaker who owns the resolved profile.

## Journey

1. The speaker reaches Profile from Home or portal navigation and sees their existing identity, biography, links, headshot, and documents.
2. They edit profile fields and biography, correct invalid URLs/length issues, save once, refresh, and confirm persistence.
3. They upload a permitted disposable headshot and documents, verify visible success after reload, then remove a disposable document through confirmation.
4. They test rejected file type and oversize states without losing existing profile data.
5. They attempt an unsaved navigation, choose stay and leave paths, and verify another speaker cannot read/edit the profile.

## Success and recovery

Upload/save failures preserve the existing asset and explain retry. See the full [Speaker Portal journey](../../features/speaker-portal/USER_JOURNEY.md).
