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

export default crons;
