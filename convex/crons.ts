import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Source sync is intentionally infrequent and organizer-visible. Manual runs remain available
// for an immediate refresh; this job keeps connected CRM sources current once per day.
crons.daily("crm-source-sync", { hourUTC: 3, minuteUTC: 15 }, internal.crmSourceActions.syncAllDaily, {});

export default crons;
