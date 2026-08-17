# Speaker portal home

**Route:** `/portal`  
**User:** Authenticated speaker whose verified identity resolves to an event speaker record.

## Journey

1. The speaker opens the portal from the account menu or public-CFP success handoff.
2. The app resolves their identity and displays only their own submission summary, profile summary, and task summary.
3. They use View all/View more and task controls to enter the corresponding owned page.
4. They refresh and confirm content remains correct; an unmatched organizer or speaker sees No speaker profile found.
5. A second speaker and altered IDs prove the dashboard never substitutes another speaker's data.

## Success and recovery

Home is read-only except task shortcuts, whose mutation behavior is documented in Speaker tasks. Identity/load errors expose no list or picker of other speakers.
