import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Poll every smtp_imap email integration once a minute. Cheap when
// nobody has one configured (one DB query, no network); proportional
// to active integrations otherwise.
crons.interval(
  "poll smtp/imap mailboxes",
  { minutes: 1 },
  internal.emailSmtpImap.pollAllMailboxes,
  {},
);

// Fire any reminders whose sendAt has passed. Cheap — by_status_send_at
// index makes the lookup constant-time when no reminders are due.
crons.interval(
  "dispatch due reminders",
  { minutes: 1 },
  internal.reminders.dispatchDue,
  {},
);

// Sync cached events from each connected calendar (Google + Microsoft)
// every 5 min. No-op when no connections exist.
crons.interval(
  "sync calendar events",
  { minutes: 5 },
  internal.calendarSync.pollAllConnections,
  {},
);

// Booking approval escalation — every 15 min, push a "still
// waiting on you" notification for any pending approval that's
// passed its booking page's approvalEscalateAfterHours threshold.
// No-op when nothing is pending or all pages have escalation off.
crons.interval(
  "escalate pending booking approvals",
  { minutes: 15 },
  internal.bookingPages._escalatePendingApprovals,
  {},
);

// Presence rows idle for a week get dropped — the monitoring table
// tracks recently-seen browsers, not history.
crons.interval(
  "purge stale visitor presence",
  { hours: 1 },
  internal.presence._purgeStalePresence,
  {},
);

export default crons;
