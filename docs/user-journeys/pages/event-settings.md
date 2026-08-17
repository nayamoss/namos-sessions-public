# Event settings

**Route:** `/events/:eventSlug/settings/event`  
**User:** Authorized event organizer.

## Journey

1. The organizer opens Event settings and sees current name, slug, dates, timezone, location, feature flags, rooms, and tracks.
2. They change a valid field, save, refresh, and confirm the new value propagates to the event chrome and affected pages.
3. They enter invalid dates/timezone/slug, correct inline errors, and ensure no partial save occurs.
4. They add, edit, reorder where supported, and remove disposable rooms and tracks; removal explains agenda/form dependencies and requires confirmation.
5. They toggle an enabled feature, verify its navigation/guard behavior, then restore the original setting.

## Success and recovery

Failed saves preserve the edited values and old persisted state. Event settings never modify another slug's configuration.
