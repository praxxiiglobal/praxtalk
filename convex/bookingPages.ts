import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireOperator } from "./auth";
import { getDefaultBrandId, hasBrandAccess } from "./brands";
import { slugify } from "./lib/auth";

const channelValidator = v.union(
  v.literal("email"),
  v.literal("sms"),
  v.literal("whatsapp"),
);

const weeklyValidator = v.array(
  v.object({
    windows: v.array(
      v.object({ startMin: v.number(), endMin: v.number() }),
    ),
  }),
);

const DEFAULT_WEEKLY = [
  { windows: [] }, // Sun
  { windows: [{ startMin: 9 * 60, endMin: 17 * 60 }] }, // Mon
  { windows: [{ startMin: 9 * 60, endMin: 17 * 60 }] }, // Tue
  { windows: [{ startMin: 9 * 60, endMin: 17 * 60 }] }, // Wed
  { windows: [{ startMin: 9 * 60, endMin: 17 * 60 }] }, // Thu
  { windows: [{ startMin: 9 * 60, endMin: 17 * 60 }] }, // Fri
  { windows: [] }, // Sat
];

// ── CRUD (operator-facing) ────────────────────────────────────────────

export const listMine = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const all = await ctx.db
      .query("bookingPages")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const isAdmin = operator.role === "owner" || operator.role === "admin";
    const accessible = isAdmin
      ? all
      : all.filter((p) => p.ownerOperatorId === operator._id);
    return accessible.map((p) => ({
      _id: p._id,
      slug: p.slug,
      title: p.title,
      description: p.description ?? null,
      durationMin: p.durationMin,
      timezone: p.timezone,
      enabled: p.enabled,
      ownerOperatorId: p.ownerOperatorId,
    }));
  },
});

export const getById = query({
  args: { sessionToken: v.string(), id: v.id("bookingPages") },
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const p = await ctx.db.get(args.id);
    if (!p || p.workspaceId !== workspaceId) return null;
    const isAdmin = operator.role === "owner" || operator.role === "admin";
    if (!isAdmin && p.ownerOperatorId !== operator._id) return null;
    return p;
  },
});

export const create = mutation({
  args: {
    sessionToken: v.string(),
    title: v.string(),
    slug: v.optional(v.string()),
    durationMin: v.number(),
    timezone: v.string(),
    confirmChannel: channelValidator,
  },
  returns: v.id("bookingPages"),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const title = args.title.trim();
    if (!title) throw new ConvexError("Title required.");
    const slug = slugify(args.slug ?? title);
    if (!slug) throw new ConvexError("Slug must be alphanumeric.");

    // Slug must be globally unique — it's the public URL.
    const existing = await ctx.db
      .query("bookingPages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (existing) throw new ConvexError("That slug is already taken.");

    if (![15, 30, 45, 60, 90, 120].includes(args.durationMin)) {
      throw new ConvexError(
        "Duration must be 15, 30, 45, 60, 90, or 120 minutes.",
      );
    }

    const brandId = await getDefaultBrandId(ctx, workspaceId);
    return await ctx.db.insert("bookingPages", {
      workspaceId,
      brandId,
      ownerOperatorId: operator._id,
      slug,
      title,
      durationMin: args.durationMin,
      bufferMin: 0,
      weekly: DEFAULT_WEEKLY,
      timezone: args.timezone,
      confirmChannel: args.confirmChannel,
      reminderOffsetMin: [-24 * 60, -60], // -24h and -1h
      enabled: true,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("bookingPages"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    durationMin: v.optional(v.number()),
    bufferMin: v.optional(v.number()),
    weekly: v.optional(weeklyValidator),
    dateOverrides: v.optional(
      v.array(
        v.object({
          date: v.string(),
          windows: v.array(
            v.object({ startMin: v.number(), endMin: v.number() }),
          ),
        }),
      ),
    ),
    additionalOwnerOperatorIds: v.optional(v.array(v.id("operators"))),
    timezone: v.optional(v.string()),
    confirmChannel: v.optional(channelValidator),
    reminderOffsetMin: v.optional(v.array(v.number())),
    enabled: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const p = await ctx.db.get(args.id);
    if (!p || p.workspaceId !== workspaceId) {
      throw new ConvexError("Not found.");
    }
    const isAdmin = operator.role === "owner" || operator.role === "admin";
    if (!isAdmin && p.ownerOperatorId !== operator._id) {
      throw new ConvexError("Not your booking page.");
    }
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.durationMin !== undefined) patch.durationMin = args.durationMin;
    if (args.bufferMin !== undefined) patch.bufferMin = args.bufferMin;
    if (args.weekly !== undefined) patch.weekly = args.weekly;
    if (args.dateOverrides !== undefined)
      patch.dateOverrides = args.dateOverrides;
    if (args.additionalOwnerOperatorIds !== undefined)
      patch.additionalOwnerOperatorIds = args.additionalOwnerOperatorIds;
    if (args.timezone !== undefined) patch.timezone = args.timezone;
    if (args.confirmChannel !== undefined)
      patch.confirmChannel = args.confirmChannel;
    if (args.reminderOffsetMin !== undefined)
      patch.reminderOffsetMin = args.reminderOffsetMin;
    if (args.enabled !== undefined) patch.enabled = args.enabled;
    await ctx.db.patch(args.id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), id: v.id("bookingPages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const p = await ctx.db.get(args.id);
    if (!p || p.workspaceId !== workspaceId) return null;
    const isAdmin = operator.role === "owner" || operator.role === "admin";
    if (!isAdmin && p.ownerOperatorId !== operator._id) {
      throw new ConvexError("Not your booking page.");
    }
    await ctx.db.delete(args.id);
    return null;
  },
});

// ── Public surfaces (visitor-facing /book/<slug>) ─────────────────────

export const getPublicBySlug = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("bookingPages"),
      slug: v.string(),
      title: v.string(),
      description: v.union(v.string(), v.null()),
      durationMin: v.number(),
      timezone: v.string(),
      ownerName: v.string(),
      brandName: v.string(),
      brandColor: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const p = await ctx.db
      .query("bookingPages")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!p || !p.enabled) return null;
    const owner = await ctx.db.get(p.ownerOperatorId);
    const brand = await ctx.db.get(p.brandId);
    return {
      _id: p._id,
      slug: p.slug,
      title: p.title,
      description: p.description ?? null,
      durationMin: p.durationMin,
      timezone: p.timezone,
      ownerName: owner?.name ?? "Team",
      brandName: brand?.name ?? "PraxTalk",
      brandColor: brand?.primaryColor ?? "#0F1A12",
    };
  },
});

/**
 * Compute open slots for a booking page across a date range. Pure
 * function over weekly availability + existing bookings; no calendar
 * sync until Phase 3.
 *
 * Times are returned as unix-ms. The visitor's UI converts to their
 * local tz for display.
 */
export const computeSlots = query({
  args: {
    slug: v.string(),
    fromDate: v.string(), // YYYY-MM-DD in the booking page's tz
    days: v.number(), // 7 / 14 / 30
  },
  returns: v.array(v.number()),
  handler: async (ctx, args) => {
    const p = await ctx.db
      .query("bookingPages")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!p || !p.enabled) return [];

    const days = Math.min(Math.max(1, args.days), 60);

    // Round-robin: union all owners, slot is open if at least one is free.
    const owners = [
      p.ownerOperatorId,
      ...(p.additionalOwnerOperatorIds ?? []),
    ];

    // Booked slots already taken across every owner. anything
    // overlapping ALL of them is fully blocked; partial conflicts
    // still leave the slot open (a different owner takes it).
    const horizonStart = parseDateInTz(args.fromDate, p.timezone);
    const horizonEnd = horizonStart + days * 24 * 60 * 60 * 1000;
    const occupiedByOwner = new Map<string, typeof p extends never ? never : Doc<"bookings">[]>();
    for (const ownerId of owners) {
      const taken = await ctx.db
        .query("bookings")
        .withIndex("by_owner_starts_at", (q) =>
          q
            .eq("ownerOperatorId", ownerId)
            .gte("startsAt", horizonStart - 12 * 60 * 60 * 1000),
        )
        .take(500);
      occupiedByOwner.set(
        ownerId,
        taken.filter(
          (b) =>
            b.status !== "cancelled" &&
            b.status !== "no_show" &&
            b.endsAt > horizonStart &&
            b.startsAt < horizonEnd,
        ),
      );
    }

    const slotMs = p.durationMin * 60 * 1000;
    const stepMs = (p.durationMin + (p.bufferMin ?? 0)) * 60 * 1000;
    const out: number[] = [];

    // Date overrides indexed by YYYY-MM-DD for O(1) lookup.
    const overrideByDate = new Map<
      string,
      { startMin: number; endMin: number }[]
    >();
    for (const o of p.dateOverrides ?? []) {
      overrideByDate.set(o.date, o.windows);
    }

    for (let d = 0; d < days; d++) {
      const dayStart = horizonStart + d * 24 * 60 * 60 * 1000;
      const dayDate = new Date(dayStart);
      const dateKey = `${dayDate.getUTCFullYear()}-${(dayDate.getUTCMonth() + 1).toString().padStart(2, "0")}-${dayDate.getUTCDate().toString().padStart(2, "0")}`;
      // Date-specific override wins over weekly. Empty windows array =
      // explicitly blocked (no slots), distinct from "no override
      // exists" which falls back to weekly.
      const override = overrideByDate.get(dateKey);
      const windows =
        override !== undefined
          ? override
          : (p.weekly[dayDate.getUTCDay()]?.windows ?? []);
      for (const w of windows) {
        const winStart = dayStart + w.startMin * 60 * 1000;
        const winEnd = dayStart + w.endMin * 60 * 1000;
        for (let t = winStart; t + slotMs <= winEnd; t += stepMs) {
          // Skip slots in the past.
          if (t < Date.now() + 5 * 60 * 1000) continue;
          // Slot is open if at least one owner is free. With one owner
          // (no round-robin) this collapses to the original behaviour.
          const anyFree = owners.some((ownerId) => {
            const ownerBookings = occupiedByOwner.get(ownerId) ?? [];
            return !ownerBookings.some(
              (b) => b.startsAt < t + slotMs && b.endsAt > t,
            );
          });
          if (!anyFree) continue;
          out.push(t);
        }
      }
    }
    return out.slice(0, 200);
  },
});

/**
 * Visitor confirms a slot. Public — no session token. Creates a
 * visitor + conversation + booking + auto-schedules reminders.
 */
export const book = mutation({
  args: {
    slug: v.string(),
    startsAt: v.number(),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    bookingId: v.id("bookings"),
    conversationId: v.id("conversations"),
  }),
  handler: async (ctx, args) => {
    const p = await ctx.db
      .query("bookingPages")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!p || !p.enabled) throw new ConvexError("Booking page not found.");

    const startsAt = args.startsAt;
    const endsAt = startsAt + p.durationMin * 60 * 1000;
    if (startsAt < Date.now()) throw new ConvexError("Slot is in the past.");

    // Round-robin assignment. Pick the first owner who's free at this
    // slot. Race-safe inside the mutation transaction (owner list is
    // re-read; conflicts checked per-owner before we commit).
    const owners = [
      p.ownerOperatorId,
      ...(p.additionalOwnerOperatorIds ?? []),
    ];
    let assignedOwnerId: typeof p.ownerOperatorId | null = null;
    for (const ownerId of owners) {
      const taken = await ctx.db
        .query("bookings")
        .withIndex("by_owner_starts_at", (q) =>
          q
            .eq("ownerOperatorId", ownerId)
            .gte("startsAt", startsAt - 4 * 60 * 60 * 1000),
        )
        .take(50);
      const conflict = taken.some(
        (b) =>
          b.status !== "cancelled" &&
          b.status !== "no_show" &&
          b.startsAt < endsAt &&
          b.endsAt > startsAt,
      );
      if (!conflict) {
        assignedOwnerId = ownerId;
        break;
      }
    }
    if (!assignedOwnerId) {
      throw new ConvexError(
        "That slot was just taken — please pick another.",
      );
    }

    // Find or create visitor by email.
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("Enter a valid email.");
    }
    const allVisitors = await ctx.db.query("visitors").collect();
    let visitor = allVisitors.find(
      (v) => v.workspaceId === p.workspaceId && v.email === email,
    );
    const now = Date.now();
    if (!visitor) {
      const id = await ctx.db.insert("visitors", {
        workspaceId: p.workspaceId,
        brandId: p.brandId,
        visitorKey: `book_${email}`,
        name: args.name.trim(),
        email,
        phone: args.phone?.trim(),
        firstSeenAt: now,
        lastSeenAt: now,
      });
      visitor = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(visitor._id, {
        lastSeenAt: now,
        name: visitor.name ?? args.name.trim(),
        phone: visitor.phone ?? args.phone?.trim(),
      });
    }

    // Open a conversation for the booking — assigned to the page owner
    // so the booking lands in their inbox.
    const conversationId = await ctx.db.insert("conversations", {
      workspaceId: p.workspaceId,
      brandId: p.brandId,
      visitorId: visitor._id,
      channel: p.confirmChannel === "email" ? "email" : "sms",
      status: "open",
      assignedOperatorId: assignedOwnerId,
      lastMessageAt: now,
      createdAt: now,
    });

    // Drop a system message so the operator immediately sees what was
    // booked when they open the conversation.
    await ctx.db.insert("messages", {
      conversationId,
      workspaceId: p.workspaceId,
      brandId: p.brandId,
      channel: p.confirmChannel === "email" ? "email" : "sms",
      role: "system",
      body: `📅 New booking — ${p.title} on ${new Date(
        startsAt,
      ).toUTCString()}. Visitor: ${args.name} <${email}>${
        args.notes ? ` · Notes: ${args.notes}` : ""
      }`,
      createdAt: now,
    });

    // Outbound confirmation to the visitor on the chosen channel —
    // reuses the existing email/SMS/WhatsApp dispatchers. Inserts an
    // atlas-role message and schedules the right outbound action.
    const confirmationBody = renderConfirmation({
      title: p.title,
      ownerName: (await ctx.db.get(assignedOwnerId))?.name ?? "the team",
      startsAt,
      endsAt,
      timezone: p.timezone,
      visitorName: args.name,
    });
    // For email: attach an ICS calendar invite. Gmail / Outlook /
    // Apple Mail auto-detect this and offer one-click "Add to
    // calendar" — much smoother than the deep-link fallback in the
    // body. SMS/WhatsApp ignore attachments.
    const icsAttachment =
      p.confirmChannel === "email"
        ? [
            {
              filename: "booking.ics",
              contentBase64: btoa(
                buildICS({
                  uid: `${conversationId}@praxtalk`,
                  title: p.title,
                  description: `${p.title} with ${
                    (await ctx.db.get(assignedOwnerId))?.name ?? "the team"
                  }.`,
                  startsAt,
                  endsAt,
                  organizerEmail:
                    (await ctx.db.get(assignedOwnerId))?.email ??
                    "noreply@praxtalk.com",
                  attendeeEmail: email,
                }),
              ),
              mimeType: "text/calendar; method=REQUEST; charset=utf-8",
            },
          ]
        : undefined;

    const confirmMsgId = await ctx.db.insert("messages", {
      conversationId,
      workspaceId: p.workspaceId,
      brandId: p.brandId,
      channel: p.confirmChannel === "email" ? "email" : p.confirmChannel === "sms" ? "sms" : "whatsapp",
      role: "atlas",
      body: confirmationBody,
      attachments: icsAttachment,
      emailSubject:
        p.confirmChannel === "email"
          ? `Booking confirmed — ${p.title}`
          : undefined,
      createdAt: now,
    });
    if (p.confirmChannel === "email") {
      await ctx.scheduler.runAfter(
        0,
        internal.emailIntegrations.sendOperatorReply,
        { messageId: confirmMsgId },
      );
    } else if (p.confirmChannel === "sms") {
      await ctx.scheduler.runAfter(
        0,
        internal.voiceIntegrations.sendSmsForMessage,
        { messageId: confirmMsgId },
      );
    }
    // WhatsApp confirmation needs a pre-approved template — skipped at
    // booking time. Visitor still sees the message in their conversation
    // when they next chat. Operator can manually send the template.

    const bookingId = await ctx.db.insert("bookings", {
      workspaceId: p.workspaceId,
      brandId: p.brandId,
      bookingPageId: p._id,
      ownerOperatorId: assignedOwnerId,
      visitorId: visitor._id,
      conversationId,
      startsAt,
      endsAt,
      status: "confirmed",
      visitorEmail: email,
      visitorPhone: args.phone,
      notes: args.notes,
      createdAt: now,
    });

    // Auto-schedule reminders at each configured offset. Skip ones
    // whose computed sendAt is already in the past.
    for (const offsetMin of p.reminderOffsetMin) {
      const sendAt = startsAt + offsetMin * 60 * 1000;
      if (sendAt < now + 30_000) continue;
      const offsetLabel =
        offsetMin <= -1440
          ? `${Math.round(-offsetMin / 1440)} day${offsetMin <= -2880 ? "s" : ""}`
          : offsetMin <= -60
            ? `${Math.round(-offsetMin / 60)} hour${offsetMin <= -120 ? "s" : ""}`
            : `${-offsetMin} min`;
      await ctx.db.insert("reminders", {
        workspaceId: p.workspaceId,
        brandId: p.brandId,
        conversationId,
        visitorId: visitor._id,
        channel: p.confirmChannel,
        sendAt,
        body: `Reminder: your ${p.title} is in ${offsetLabel}. See you soon!`,
        status: "pending",
        scheduledByOperatorId: assignedOwnerId,
        scheduledAt: now,
      });
    }

    return { bookingId, conversationId };
  },
});

// ── Helpers ───────────────────────────────────────────────────────────

function renderConfirmation(args: {
  title: string;
  ownerName: string;
  startsAt: number;
  endsAt: number;
  timezone: string;
  visitorName: string;
}): string {
  const when = new Date(args.startsAt).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const links = calendarLinks({
    title: args.title,
    description: `${args.title} with ${args.ownerName}.`,
    startsAt: args.startsAt,
    endsAt: args.endsAt,
  });
  return `Hi ${args.visitorName},

You're booked in for "${args.title}" with ${args.ownerName} on ${when}.

Add to your calendar:
  • Google: ${links.google}
  • Outlook: ${links.outlook}

We'll send a reminder closer to the time. To reschedule or cancel, just reply to this message and we'll sort it out.

Looking forward to chatting!`;
}

/**
 * Build add-to-calendar deep links. No backend hosting required —
 * Google/Outlook accept the event payload as URL params and open
 * their compose UI pre-filled. Apple Calendar uses the same Google
 * link in practice (most desktop browsers respect the .ics MIME type).
 */
function calendarLinks(args: {
  title: string;
  description: string;
  startsAt: number;
  endsAt: number;
}): { google: string; outlook: string } {
  const fmtUTC = (ts: number): string => {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(
      d.getUTCDate(),
    )}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  };
  const startUTC = fmtUTC(args.startsAt);
  const endUTC = fmtUTC(args.endsAt);
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(args.title)}&dates=${startUTC}/${endUTC}&details=${encodeURIComponent(args.description)}`;
  // Outlook uses ISO 8601 with milliseconds.
  const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&subject=${encodeURIComponent(args.title)}&body=${encodeURIComponent(args.description)}&startdt=${new Date(args.startsAt).toISOString()}&enddt=${new Date(args.endsAt).toISOString()}`;
  return { google, outlook };
}

/**
 * Minimal RFC 5545 VEVENT generator. Enough for Gmail/Outlook/Apple
 * to recognise as a calendar invite and offer one-click add. Pure
 * function — no external deps, no hosting required.
 */
function buildICS(args: {
  uid: string;
  title: string;
  description: string;
  startsAt: number;
  endsAt: number;
  organizerEmail: string;
  attendeeEmail: string;
}): string {
  const fmt = (ts: number): string => {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(
      d.getUTCDate(),
    )}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(
      d.getUTCSeconds(),
    )}Z`;
  };
  const escape = (s: string): string =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PraxTalk//Booking//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${args.uid}`,
    `DTSTAMP:${fmt(Date.now())}`,
    `DTSTART:${fmt(args.startsAt)}`,
    `DTEND:${fmt(args.endsAt)}`,
    `SUMMARY:${escape(args.title)}`,
    `DESCRIPTION:${escape(args.description)}`,
    `ORGANIZER;CN=${escape(args.organizerEmail)}:mailto:${args.organizerEmail}`,
    `ATTENDEE;CN=${escape(args.attendeeEmail)};RSVP=TRUE:mailto:${args.attendeeEmail}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // ICS lines must be CRLF-terminated.
  return lines.join("\r\n") + "\r\n";
}

function parseDateInTz(yyyymmdd: string, _tz: string): number {
  // For MVP we treat the date as midnight UTC. Proper tz handling
  // (Asia/Kolkata vs UTC etc) can layer in later — most customers
  // book within +/- 30 days, the tz drift is small and the slot
  // computation already filters past slots.
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}
