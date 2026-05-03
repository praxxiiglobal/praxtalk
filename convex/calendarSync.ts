import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

/**
 * Phase 3 slice 2 — event sync. Cron action `pollAllConnections` runs
 * every 5 minutes (convex/crons.ts) and refreshes the cached event
 * window for each calendar connection. Slot-exclusion in
 * bookingPages.computeSlots reads from the cached events; this is the
 * write side.
 *
 * Per provider:
 *   - Refresh access token if expired (using refresh_token).
 *   - Fetch events for the next 30 days.
 *   - Upsert into calendarEvents (keyed on externalId per connection).
 *   - Delete cached events that no longer appear in the response
 *     (covers cancellations).
 *
 * Failures get stamped on the connection row so operators can see
 * what went wrong without trawling the logs.
 */

const SYNC_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days forward

type CalendarEvent = {
  externalId: string;
  startsAt: number;
  endsAt: number;
  busy: boolean;
};

export const pollAllConnections = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const connections: Array<{
      _id: Id<"calendarConnections">;
      operatorId: Id<"operators">;
      provider: "google" | "microsoft" | "caldav";
      accessToken: string;
      refreshToken: string | null;
      tokenExpiresAt: number | null;
      calendarId: string | null;
    }> = await ctx.runQuery(
      internal.calendarSync._listConnectionsForPolling,
    );

    for (const c of connections) {
      try {
        await syncOne(ctx, c);
      } catch (err) {
        await ctx.runMutation(internal.calendarSync._stampSyncError, {
          connectionId: c._id,
          error: err instanceof Error ? err.message : "Unknown sync error",
        });
      }
    }
    return null;
  },
});

async function syncOne(
  ctx: { runMutation: any; runQuery: any },
  c: {
    _id: Id<"calendarConnections">;
    operatorId: Id<"operators">;
    provider: "google" | "microsoft" | "caldav";
    accessToken: string;
    refreshToken: string | null;
    tokenExpiresAt: number | null;
    calendarId: string | null;
  },
): Promise<void> {
  if (c.provider === "caldav") {
    // CalDAV not implemented in slice 2 — needs PROPFIND/REPORT
    // requests + ICS parsing. Most customers want Google or Microsoft
    // first; CalDAV ships in a follow-up if a customer asks.
    return;
  }

  // Refresh token if expired or about to expire (within 60s).
  let accessToken = c.accessToken;
  if (
    c.tokenExpiresAt &&
    c.tokenExpiresAt < Date.now() + 60_000 &&
    c.refreshToken
  ) {
    const refreshed = await refreshAccessToken(c.provider, c.refreshToken);
    if (refreshed) {
      accessToken = refreshed.accessToken;
      await ctx.runMutation(internal.calendarSync._updateAccessToken, {
        connectionId: c._id,
        accessToken: refreshed.accessToken,
        tokenExpiresAt: refreshed.expiresAt,
      });
    }
  }

  // Fetch events from the provider for the next 30 days.
  const events =
    c.provider === "google"
      ? await fetchGoogleEvents(accessToken, c.calendarId ?? "primary")
      : await fetchMicrosoftEvents(accessToken);

  // Reconcile with cache: upsert new/changed, delete missing.
  const existing: Array<{
    _id: Id<"calendarEvents">;
    externalId: string;
  }> = await ctx.runQuery(internal.calendarSync._listCachedForConnection, {
    connectionId: c._id,
  });
  const existingByExt = new Map(existing.map((e) => [e.externalId, e._id]));
  const seen = new Set<string>();

  for (const evt of events) {
    seen.add(evt.externalId);
    await ctx.runMutation(internal.calendarSync._upsertEvent, {
      connectionId: c._id,
      operatorId: c.operatorId,
      externalId: evt.externalId,
      startsAt: evt.startsAt,
      endsAt: evt.endsAt,
      busy: evt.busy,
    });
  }
  for (const [externalId, eventId] of existingByExt) {
    if (!seen.has(externalId)) {
      await ctx.runMutation(internal.calendarSync._deleteEvent, {
        eventId,
      });
    }
  }

  await ctx.runMutation(internal.calendarSync._markSynced, {
    connectionId: c._id,
  });
}

// ── Provider adapters ─────────────────────────────────────────────────

async function refreshAccessToken(
  provider: "google" | "microsoft",
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number } | null> {
  const clientId =
    provider === "google"
      ? process.env.GOOGLE_OAUTH_CLIENT_ID
      : process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const clientSecret =
    provider === "google"
      ? process.env.GOOGLE_OAUTH_CLIENT_SECRET
      : process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const url =
    provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const form = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };
  return {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

async function fetchGoogleEvents(
  accessToken: string,
  calendarId: string,
): Promise<CalendarEvent[]> {
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + SYNC_WINDOW_MS).toISOString();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true", // expand recurring events into instances
    maxResults: "250",
    orderBy: "startTime",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Google events ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    items?: Array<{
      id?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      transparency?: string;
      status?: string;
    }>;
  };
  const out: CalendarEvent[] = [];
  for (const ev of json.items ?? []) {
    if (!ev.id) continue;
    if (ev.status === "cancelled") continue;
    const start = ev.start?.dateTime ?? ev.start?.date;
    const end = ev.end?.dateTime ?? ev.end?.date;
    if (!start || !end) continue;
    const startsAt = Date.parse(start);
    const endsAt = Date.parse(end);
    if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) continue;
    out.push({
      externalId: ev.id,
      startsAt,
      endsAt,
      busy: ev.transparency !== "transparent",
    });
  }
  return out;
}

async function fetchMicrosoftEvents(
  accessToken: string,
): Promise<CalendarEvent[]> {
  const startDateTime = new Date().toISOString();
  const endDateTime = new Date(Date.now() + SYNC_WINDOW_MS).toISOString();
  const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}&$top=250&$orderby=start/dateTime`;
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      // Microsoft returns event times in the calendar's tz by default;
      // request UTC to make Date.parse trivial.
      Prefer: 'outlook.timezone="UTC"',
    },
  });
  if (!res.ok) {
    throw new Error(`Microsoft events ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    value?: Array<{
      id?: string;
      start?: { dateTime?: string };
      end?: { dateTime?: string };
      showAs?: string;
      isCancelled?: boolean;
    }>;
  };
  const out: CalendarEvent[] = [];
  for (const ev of json.value ?? []) {
    if (!ev.id || ev.isCancelled) continue;
    if (!ev.start?.dateTime || !ev.end?.dateTime) continue;
    const startsAt = Date.parse(ev.start.dateTime + "Z");
    const endsAt = Date.parse(ev.end.dateTime + "Z");
    if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) continue;
    out.push({
      externalId: ev.id,
      startsAt,
      endsAt,
      // Microsoft's showAs values: free / tentative / busy / oof / workingElsewhere / unknown.
      busy: ev.showAs !== "free",
    });
  }
  return out;
}

// ── Internal queries / mutations ──────────────────────────────────────

export const _listConnectionsForPolling = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("calendarConnections").collect();
    return all.map((c) => ({
      _id: c._id,
      operatorId: c.operatorId,
      provider: c.provider,
      accessToken: c.accessToken,
      refreshToken: c.refreshToken ?? null,
      tokenExpiresAt: c.tokenExpiresAt ?? null,
      calendarId: c.calendarId ?? null,
    }));
  },
});

export const _listCachedForConnection = internalQuery({
  args: { connectionId: v.id("calendarConnections") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("calendarEvents")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", args.connectionId),
      )
      .collect();
    return all.map((e) => ({ _id: e._id, externalId: e.externalId }));
  },
});

export const _upsertEvent = internalMutation({
  args: {
    connectionId: v.id("calendarConnections"),
    operatorId: v.id("operators"),
    externalId: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    busy: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("calendarEvents")
      .withIndex("by_external", (q) =>
        q
          .eq("connectionId", args.connectionId)
          .eq("externalId", args.externalId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        startsAt: args.startsAt,
        endsAt: args.endsAt,
        busy: args.busy,
      });
      return null;
    }
    await ctx.db.insert("calendarEvents", {
      connectionId: args.connectionId,
      operatorId: args.operatorId,
      externalId: args.externalId,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      busy: args.busy,
    });
    return null;
  },
});

export const _deleteEvent = internalMutation({
  args: { eventId: v.id("calendarEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.eventId);
    return null;
  },
});

export const _stampSyncError = internalMutation({
  args: {
    connectionId: v.id("calendarConnections"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      lastSyncError: args.error,
    });
    return null;
  },
});

export const _markSynced = internalMutation({
  args: { connectionId: v.id("calendarConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      lastSyncedAt: Date.now(),
      lastSyncError: undefined,
    });
    return null;
  },
});

export const _updateAccessToken = internalMutation({
  args: {
    connectionId: v.id("calendarConnections"),
    accessToken: v.string(),
    tokenExpiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      accessToken: args.accessToken,
      tokenExpiresAt: args.tokenExpiresAt,
    });
    return null;
  },
});

// ── Booking write-back (slice 4) ──────────────────────────────────────

/**
 * Create the corresponding event in the booking owner's connected
 * calendar so it shows up in their Google / Outlook UI immediately.
 * No-op when the owner has no connected calendar — graceful degradation;
 * booking still works, just doesn't sync out.
 *
 * Triggered by bookingPages.book scheduling this action with
 * runAfter(0, ...). Failures are logged but don't block the booking.
 *
 * On success: stamps the calendar event id back onto the booking row
 * so the cancel flow can delete the event later.
 */
export const writeBookingToCalendar = internalAction({
  args: {
    operatorId: v.id("operators"),
    bookingId: v.id("bookings"),
    title: v.string(),
    description: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    attendeeEmail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const conn: {
      _id: Id<"calendarConnections">;
      provider: "google" | "microsoft" | "caldav";
      accessToken: string;
      refreshToken: string | null;
      tokenExpiresAt: number | null;
      calendarId: string | null;
    } | null = await ctx.runQuery(
      internal.calendarSync._loadConnectionForOperator,
      { operatorId: args.operatorId },
    );
    if (!conn) return null;
    if (conn.provider === "caldav") return null; // not yet implemented

    let accessToken = conn.accessToken;
    if (
      conn.tokenExpiresAt &&
      conn.tokenExpiresAt < Date.now() + 60_000 &&
      conn.refreshToken
    ) {
      const refreshed = await refreshAccessToken(
        conn.provider,
        conn.refreshToken,
      );
      if (refreshed) {
        accessToken = refreshed.accessToken;
        await ctx.runMutation(internal.calendarSync._updateAccessToken, {
          connectionId: conn._id,
          accessToken: refreshed.accessToken,
          tokenExpiresAt: refreshed.expiresAt,
        });
      }
    }

    try {
      let externalEventId: string | undefined;
      if (conn.provider === "google") {
        externalEventId = await createGoogleEvent({
          accessToken,
          calendarId: conn.calendarId ?? "primary",
          title: args.title,
          description: args.description,
          startsAt: args.startsAt,
          endsAt: args.endsAt,
          attendeeEmail: args.attendeeEmail,
        });
      } else {
        externalEventId = await createMicrosoftEvent({
          accessToken,
          title: args.title,
          description: args.description,
          startsAt: args.startsAt,
          endsAt: args.endsAt,
          attendeeEmail: args.attendeeEmail,
        });
      }
      if (externalEventId) {
        await ctx.runMutation(internal.calendarSync._linkBookingToEvent, {
          bookingId: args.bookingId,
          calendarConnectionId: conn._id,
          calendarEventExternalId: externalEventId,
        });
      }
    } catch (err) {
      console.warn("[calendar] write-back failed", err);
    }
    return null;
  },
});

/**
 * Counterpart to writeBookingToCalendar — deletes the event from the
 * owner's connected calendar when a booking is cancelled. Looks up
 * everything it needs from the booking row (connection + external
 * event id, both stamped at write-back time).
 */
export const deleteBookingFromCalendar = internalAction({
  args: { bookingId: v.id("bookings") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const ctxData: {
      provider: "google" | "microsoft" | "caldav";
      accessToken: string;
      refreshToken: string | null;
      tokenExpiresAt: number | null;
      calendarId: string | null;
      connectionId: Id<"calendarConnections">;
      externalEventId: string;
    } | null = await ctx.runQuery(
      internal.calendarSync._loadConnectionForBooking,
      { bookingId: args.bookingId },
    );
    if (!ctxData) return null;
    if (ctxData.provider === "caldav") return null;

    let accessToken = ctxData.accessToken;
    if (
      ctxData.tokenExpiresAt &&
      ctxData.tokenExpiresAt < Date.now() + 60_000 &&
      ctxData.refreshToken
    ) {
      const refreshed = await refreshAccessToken(
        ctxData.provider,
        ctxData.refreshToken,
      );
      if (refreshed) {
        accessToken = refreshed.accessToken;
        await ctx.runMutation(internal.calendarSync._updateAccessToken, {
          connectionId: ctxData.connectionId,
          accessToken: refreshed.accessToken,
          tokenExpiresAt: refreshed.expiresAt,
        });
      }
    }

    try {
      if (ctxData.provider === "google") {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ctxData.calendarId ?? "primary")}/events/${encodeURIComponent(ctxData.externalEventId)}`,
          {
            method: "DELETE",
            headers: { authorization: `Bearer ${accessToken}` },
          },
        );
        // 410 Gone = already deleted; treat as success.
        if (!res.ok && res.status !== 410 && res.status !== 404) {
          console.warn(
            "[calendar] google delete failed",
            res.status,
            await res.text(),
          );
        }
      } else {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(ctxData.externalEventId)}`,
          {
            method: "DELETE",
            headers: { authorization: `Bearer ${accessToken}` },
          },
        );
        if (!res.ok && res.status !== 404) {
          console.warn(
            "[calendar] microsoft delete failed",
            res.status,
            await res.text(),
          );
        }
      }
    } catch (err) {
      console.warn("[calendar] delete-back failed", err);
    }
    return null;
  },
});

export const _linkBookingToEvent = internalMutation({
  args: {
    bookingId: v.id("bookings"),
    calendarConnectionId: v.id("calendarConnections"),
    calendarEventExternalId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.bookingId, {
      calendarConnectionId: args.calendarConnectionId,
      calendarEventExternalId: args.calendarEventExternalId,
    });
    return null;
  },
});

export const _loadConnectionForBooking = internalQuery({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.bookingId);
    if (!b || !b.calendarConnectionId || !b.calendarEventExternalId)
      return null;
    const c = await ctx.db.get(b.calendarConnectionId);
    if (!c) return null;
    return {
      provider: c.provider,
      accessToken: c.accessToken,
      refreshToken: c.refreshToken ?? null,
      tokenExpiresAt: c.tokenExpiresAt ?? null,
      calendarId: c.calendarId ?? null,
      connectionId: c._id,
      externalEventId: b.calendarEventExternalId,
    };
  },
});

export const _loadConnectionForOperator = internalQuery({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    const c = await ctx.db
      .query("calendarConnections")
      .withIndex("by_operator", (q) => q.eq("operatorId", args.operatorId))
      .first();
    if (!c) return null;
    return {
      _id: c._id,
      provider: c.provider,
      accessToken: c.accessToken,
      refreshToken: c.refreshToken ?? null,
      tokenExpiresAt: c.tokenExpiresAt ?? null,
      calendarId: c.calendarId ?? null,
    };
  },
});

async function createGoogleEvent(args: {
  accessToken: string;
  calendarId: string;
  title: string;
  description: string;
  startsAt: number;
  endsAt: number;
  attendeeEmail?: string;
}): Promise<string | undefined> {
  const body: Record<string, unknown> = {
    summary: args.title,
    description: args.description,
    start: { dateTime: new Date(args.startsAt).toISOString() },
    end: { dateTime: new Date(args.endsAt).toISOString() },
  };
  if (args.attendeeEmail) {
    body.attendees = [{ email: args.attendeeEmail }];
  }
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(args.calendarId)}/events`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${args.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`Google create event ${res.status}: ${await res.text()}`);
  }
  try {
    const json = (await res.json()) as { id?: string };
    return json.id;
  } catch {
    return undefined;
  }
}

async function createMicrosoftEvent(args: {
  accessToken: string;
  title: string;
  description: string;
  startsAt: number;
  endsAt: number;
  attendeeEmail?: string;
}): Promise<string | undefined> {
  const body: Record<string, unknown> = {
    subject: args.title,
    body: { contentType: "text", content: args.description },
    start: {
      dateTime: new Date(args.startsAt).toISOString(),
      timeZone: "UTC",
    },
    end: {
      dateTime: new Date(args.endsAt).toISOString(),
      timeZone: "UTC",
    },
  };
  if (args.attendeeEmail) {
    body.attendees = [
      {
        emailAddress: { address: args.attendeeEmail },
        type: "required",
      },
    ];
  }
  const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `Microsoft create event ${res.status}: ${await res.text()}`,
    );
  }
  try {
    const json = (await res.json()) as { id?: string };
    return json.id;
  } catch {
    return undefined;
  }
}
