import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Source sync is intentionally infrequent and organizer-visible. Manual runs remain available
// for an immediate refresh; this job keeps connected CRM sources current once per day.
crons.daily("crm-source-sync", { hourUTC: 3, minuteUTC: 15 }, internal.crmSourceActions.syncAllDaily, {});
crons.daily("recording-asset-cleanup", { hourUTC: 4, minuteUTC: 0 }, internal.recordings.cleanupUnusedAssets, {});

crons.daily("clean expired Slack integration records", { hourUTC: 3, minuteUTC: 20 }, internal.slackIntegrations.cleanupEphemeral, { limit: 200 });
export default crons;
