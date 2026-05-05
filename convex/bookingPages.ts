import { v } from "convex/values";
import { ConvexError } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
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
    // Two-stage filter: ownership (admin sees all, non-admin sees own),
    // then brand access (brand-restricted operators don't see pages
    // belonging to brands they're locked out of).
    const accessible = (
      isAdmin ? all : all.filter((p) => p.ownerOperatorId === operator._id)
    ).filter((p) => hasBrandAccess(operator, p.brandId));
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
    if (!hasBrandAccess(operator, p.brandId)) return null;
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
    requiresApproval: v.optional(v.boolean()),
    approvalMode: v.optional(v.union(v.literal("any"), v.literal("all"))),
    approvalOperatorIds: v.optional(v.array(v.id("operators"))),
    approvalTimeoutHours: v.optional(v.number()),
    approvalEscalateAfterHours: v.optional(v.number()),
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
    if (!hasBrandAccess(operator, p.brandId)) {
      throw new ConvexError("No access to this brand.");
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
    if (args.requiresApproval !== undefined)
      patch.requiresApproval = args.requiresApproval;
    if (args.approvalMode !== undefined) patch.approvalMode = args.approvalMode;
    if (args.approvalOperatorIds !== undefined) {
      // Validate every approver belongs to this workspace.
      for (const opId of args.approvalOperatorIds) {
        const op = await ctx.db.get(opId);
        if (!op || op.workspaceId !== workspaceId) {
          throw new ConvexError("Approver doesn't belong to this workspace.");
        }
      }
      patch.approvalOperatorIds = args.approvalOperatorIds;
    }
    if (args.approvalTimeoutHours !== undefined) {
      const h = args.approvalTimeoutHours;
      if (h < 1 || h > 168) {
        throw new ConvexError(
          "Approval timeout must be 1–168 hours (1 hr to 7 days).",
        );
      }
      patch.approvalTimeoutHours = h;
    }
    if (args.approvalEscalateAfterHours !== undefined) {
      const h = args.approvalEscalateAfterHours;
      if (h < 0 || h > 168) {
        throw new ConvexError(
          "Escalate-after must be 0 (disabled) to 168 hours.",
        );
      }
      patch.approvalEscalateAfterHours = h;
    }
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
    if (!hasBrandAccess(operator, p.brandId)) {
      throw new ConvexError("No access to this brand.");
    }
    await ctx.db.delete(args.id);
    return null;
  },
});

/**
 * Operator-callable cancellation. Marks the booking cancelled, deletes
 * the corresponding event from the connected calendar (no-op if the
 * owner had no calendar connected), and cancels every pending reminder
 * tied to the booking's conversation.
 */
export const cancelBooking = mutation({
  args: { sessionToken: v.string(), bookingId: v.id("bookings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const b = await ctx.db.get(args.bookingId);
    if (!b || b.workspaceId !== workspaceId) {
      throw new ConvexError("Booking not found.");
    }
    const isAdmin =
      operator.role === "owner" || operator.role === "admin";
    if (b.ownerOperatorId !== operator._id && !isAdmin) {
      throw new ConvexError("Not your booking.");
    }
    if (b.brandId && !hasBrandAccess(operator, b.brandId)) {
      throw new ConvexError("No access to this brand.");
    }
    if (b.status === "cancelled") return null; // idempotent

    await ctx.db.patch(args.bookingId, { status: "cancelled" });

    // Cancel pending reminders for this conversation — anything that
    // hasn't fired yet would now be misleading.
    const pending = await ctx.db
      .query("reminders")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", b.conversationId),
      )
      .collect();
    for (const r of pending) {
      if (r.status === "pending") {
        await ctx.db.patch(r._id, { status: "cancelled" });
      }
    }

    // Delete from the owner's connected calendar (fire-and-forget;
    // failures are logged inside the action).
    if (b.calendarConnectionId && b.calendarEventExternalId) {
      await ctx.scheduler.runAfter(
        0,
        internal.calendarSync.deleteBookingFromCalendar,
        { bookingId: args.bookingId },
      );
    }

    // Drop a system message so the operator + visitor see what happened.
    await ctx.db.insert("messages", {
      conversationId: b.conversationId,
      workspaceId: b.workspaceId,
      brandId: b.brandId,
      channel: "email",
      role: "system",
      body: `📅 Booking cancelled — ${new Date(b.startsAt).toUTCString()}`,
      createdAt: Date.now(),
    });

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
      requiresApproval: v.boolean(),
      approvalTimeoutHours: v.union(v.number(), v.null()),
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
      requiresApproval: p.requiresApproval === true,
      approvalTimeoutHours: p.approvalTimeoutHours ?? null,
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
    const occupiedByOwner = new Map<string, { startsAt: number; endsAt: number }[]>();
    for (const ownerId of owners) {
      const taken = await ctx.db
        .query("bookings")
        .withIndex("by_owner_starts_at", (q) =>
          q
            .eq("ownerOperatorId", ownerId)
            .gte("startsAt", horizonStart - 12 * 60 * 60 * 1000),
        )
        .take(500);
      const occupied: { startsAt: number; endsAt: number }[] = taken
        .filter(
          (b) =>
            b.status !== "cancelled" &&
            b.status !== "no_show" &&
            b.endsAt > horizonStart &&
            b.startsAt < horizonEnd,
        )
        .map((b) => ({ startsAt: b.startsAt, endsAt: b.endsAt }));

      // Phase 3: also exclude events from the operator's connected
      // external calendar (Google / Microsoft). Cached by the
      // calendarSync cron — falls back to "no calendar = no extra
      // exclusions" when the operator hasn't connected one.
      const calEvents = await ctx.db
        .query("calendarEvents")
        .withIndex("by_operator_starts_at", (q) =>
          q
            .eq("operatorId", ownerId)
            .gte("startsAt", horizonStart - 12 * 60 * 60 * 1000),
        )
        .take(500);
      for (const e of calEvents) {
        if (!e.busy) continue; // free / transparent events don't block
        if (e.endsAt <= horizonStart || e.startsAt >= horizonEnd) continue;
        occupied.push({ startsAt: e.startsAt, endsAt: e.endsAt });
      }
      occupiedByOwner.set(ownerId, occupied);
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

    // Round-robin assignment. Pick the first owner free at this slot
    // as the primary host; collect every other owner who's also free
    // for multi-attendee calendar fan-out.
    const owners = [
      p.ownerOperatorId,
      ...(p.additionalOwnerOperatorIds ?? []),
    ];
    const freeOwners: Id<"operators">[] = [];
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
          b.status !== "declined" &&
          b.startsAt < endsAt &&
          b.endsAt > startsAt,
      );
      if (!conflict) freeOwners.push(ownerId);
    }
    if (freeOwners.length === 0) {
      throw new ConvexError(
        "That slot was just taken — please pick another.",
      );
    }
    const assignedOwnerId = freeOwners[0];
    const additionalAttendees = freeOwners.slice(1);

    // Find or create visitor by email.
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("Enter a valid email.");
    }
    let visitor = await ctx.db
      .query("visitors")
      .withIndex("by_workspace_email", (q) =>
        q.eq("workspaceId", p.workspaceId).eq("email", email),
      )
      .first();
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

    // Drop an internal system message so the operator(s) immediately
    // see what was booked when they open the conversation.
    const requiresApproval = p.requiresApproval === true;
    const attendeeNote =
      additionalAttendees.length > 0
        ? ` · ${additionalAttendees.length + 1} attendees`
        : "";
    await ctx.db.insert("messages", {
      conversationId,
      workspaceId: p.workspaceId,
      brandId: p.brandId,
      channel: p.confirmChannel === "email" ? "email" : "sms",
      role: "system",
      body: `📅 ${requiresApproval ? "Pending approval" : "New booking"} — ${
        p.title
      } on ${new Date(startsAt).toUTCString()}. Visitor: ${
        args.name
      } <${email}>${args.notes ? ` · Notes: ${args.notes}` : ""}${attendeeNote}`,
      createdAt: now,
    });

    const approvalMode: "any" | "all" = p.approvalMode ?? "any";
    const approvalDeadlineAt = requiresApproval
      ? now + (p.approvalTimeoutHours ?? 24) * 60 * 60 * 1000
      : undefined;

    const bookingId = await ctx.db.insert("bookings", {
      workspaceId: p.workspaceId,
      brandId: p.brandId,
      bookingPageId: p._id,
      ownerOperatorId: assignedOwnerId,
      additionalAttendeeOperatorIds:
        additionalAttendees.length > 0 ? additionalAttendees : undefined,
      visitorId: visitor._id,
      conversationId,
      startsAt,
      endsAt,
      status: requiresApproval ? "pending_approval" : "confirmed",
      visitorEmail: email,
      visitorPhone: args.phone,
      notes: args.notes,
      approvalMode: requiresApproval ? approvalMode : undefined,
      approvalDeadlineAt,
      createdAt: now,
    });

    if (requiresApproval) {
      // Approval-gated path: insert one approval row per approver,
      // notify them, send the visitor an "awaiting approval" message,
      // and schedule the auto-decline at the deadline.
      const approverIds =
        p.approvalOperatorIds && p.approvalOperatorIds.length > 0
          ? p.approvalOperatorIds
          : owners; // fall back to every owner
      const dedup = Array.from(new Set(approverIds.map(String))).map(
        (s) => s as unknown as Id<"operators">,
      );
      for (const approverId of dedup) {
        await ctx.db.insert("bookingApprovals", {
          bookingId,
          workspaceId: p.workspaceId,
          approverOperatorId: approverId,
          decision: "pending",
          createdAt: now,
        });
        // Activity-feed notification per approver.
        await ctx.db.insert("notifications", {
          workspaceId: p.workspaceId,
          operatorId: approverId,
          kind: "human_requested",
          severity: "warn",
          title: `Booking awaiting approval — ${p.title}`,
          body: `${args.name} <${email}> requested ${new Date(
            startsAt,
          ).toLocaleString()}.`,
          link: `/app/schedules?approval=${bookingId}`,
          createdAt: now,
        });
      }

      // Visitor-facing "pending" message — same channel as confirmChannel.
      const pendingBody = renderPending({
        title: p.title,
        startsAt,
        timezone: p.timezone,
        visitorName: args.name,
      });
      const pendingMsgId = await ctx.db.insert("messages", {
        conversationId,
        workspaceId: p.workspaceId,
        brandId: p.brandId,
        channel:
          p.confirmChannel === "email"
            ? "email"
            : p.confirmChannel === "sms"
              ? "sms"
              : "whatsapp",
        role: "atlas",
        body: pendingBody,
        emailSubject:
          p.confirmChannel === "email"
            ? `Booking received — ${p.title} (pending approval)`
            : undefined,
        createdAt: now,
      });
      if (p.confirmChannel === "email") {
        await ctx.scheduler.runAfter(
          0,
          internal.emailIntegrations.sendOperatorReply,
          { messageId: pendingMsgId },
        );
      } else if (p.confirmChannel === "sms") {
        await ctx.scheduler.runAfter(
          0,
          internal.voiceIntegrations.sendSmsForMessage,
          { messageId: pendingMsgId },
        );
      }

      // Auto-decline at the approval deadline. The action checks
      // status before patching, so a timely approval makes this a no-op.
      if (approvalDeadlineAt) {
        await ctx.scheduler.runAt(
          approvalDeadlineAt,
          internal.bookingPages._autoDeclineBooking,
          { bookingId },
        );
      }
    } else {
      // Immediate-confirm path: do all the visitor confirmation +
      // calendar fan-out + reminder work right now (same transaction
      // — finalizeBookingHelper is a plain TS function, not a
      // mutation, so we don't run into the no-mutation-from-mutation
      // restriction).
      await finalizeBookingHelper(ctx, bookingId);
    }

    return { bookingId, conversationId };
  },
});

// ── Approval flow ─────────────────────────────────────────────────────

/**
 * Approver responds to a pending booking. The decision rules:
 *   - mode="any": one approval confirms; all-must-decline declines.
 *   - mode="all": all approvals confirm; any single decline declines.
 * On confirm we run finalizeBookingHelper (visitor confirmation +
 * calendar fan-out + reminders); on decline we send a "sorry, can't
 * make it" message to the visitor and mark the booking declined.
 */
export const respondToBookingApproval = mutation({
  args: {
    sessionToken: v.string(),
    bookingId: v.id("bookings"),
    decision: v.union(v.literal("approved"), v.literal("declined")),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.workspaceId !== workspaceId) {
      throw new ConvexError("Booking not found.");
    }
    if (booking.status !== "pending_approval") {
      throw new ConvexError(
        `This booking is already ${booking.status} — nothing to approve.`,
      );
    }
    if (!hasBrandAccess(operator, booking.brandId)) {
      throw new ConvexError("No access to this brand.");
    }

    // Find this approver's row.
    const approvals = await ctx.db
      .query("bookingApprovals")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect();
    const mine = approvals.find(
      (a) => a.approverOperatorId === operator._id,
    );
    if (!mine) {
      throw new ConvexError("You're not listed as an approver on this booking.");
    }
    if (mine.decision !== "pending") {
      throw new ConvexError(
        `You already ${mine.decision} this booking.`,
      );
    }
    await ctx.db.patch(mine._id, {
      decision: args.decision,
      note: args.note?.trim() || undefined,
      respondedAt: Date.now(),
    });

    // Re-evaluate. Reload approvals so we see our own update.
    const updated = await ctx.db
      .query("bookingApprovals")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect();
    const mode: "any" | "all" = booking.approvalMode ?? "any";
    const anyDeclined = updated.some((a) => a.decision === "declined");
    const allApproved = updated.every((a) => a.decision === "approved");
    const anyApproved = updated.some((a) => a.decision === "approved");

    if (mode === "any") {
      if (anyApproved) {
        await ctx.db.patch(args.bookingId, {
          status: "confirmed",
          finalizedAt: Date.now(),
        });
        await finalizeBookingHelper(ctx, args.bookingId);
      } else if (
        updated.length > 0 &&
        updated.every((a) => a.decision === "declined")
      ) {
        await declineBookingHelper(
          ctx,
          args.bookingId,
          args.note ?? "All approvers declined.",
        );
      }
    } else {
      // mode === "all"
      if (anyDeclined) {
        await declineBookingHelper(
          ctx,
          args.bookingId,
          args.note ?? "An approver declined.",
        );
      } else if (allApproved) {
        await ctx.db.patch(args.bookingId, {
          status: "confirmed",
          finalizedAt: Date.now(),
        });
        await finalizeBookingHelper(ctx, args.bookingId);
      }
    }
    return null;
  },
});

/**
 * Scheduled at booking-time when requiresApproval is on. Fires at
 * approvalDeadlineAt; if the booking is still pending, decline it.
 * No-op if approvers already responded.
 */
export const _autoDeclineBooking = internalMutation({
  args: { bookingId: v.id("bookings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.bookingId);
    if (!b) return null;
    if (b.status !== "pending_approval") return null;
    await declineBookingHelper(
      ctx,
      args.bookingId,
      "Approval window expired — no approver responded in time.",
    );
    return null;
  },
});

/**
 * Phase 2 — delegate. The current pending approver passes the
 * decision off to a colleague. The original row is marked
 * "delegated" (not declined — important for the audit trail), and
 * a fresh pending row is created for the recipient. The booking's
 * approval rules (any/all) are unchanged; the recipient just
 * counts in place of the original approver from now on.
 */
export const delegateBookingApproval = mutation({
  args: {
    sessionToken: v.string(),
    bookingId: v.id("bookings"),
    toOperatorId: v.id("operators"),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.workspaceId !== workspaceId) {
      throw new ConvexError("Booking not found.");
    }
    if (booking.status !== "pending_approval") {
      throw new ConvexError("Booking is no longer pending.");
    }
    if (!hasBrandAccess(operator, booking.brandId)) {
      throw new ConvexError("No access to this brand.");
    }
    const recipient = await ctx.db.get(args.toOperatorId);
    if (!recipient || recipient.workspaceId !== workspaceId) {
      throw new ConvexError("Recipient operator not found.");
    }

    // Find the caller's pending row.
    const myRow = await ctx.db
      .query("bookingApprovals")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect()
      .then((rows) =>
        rows.find(
          (r) =>
            r.approverOperatorId === operator._id && r.decision === "pending",
        ),
      );
    if (!myRow) {
      throw new ConvexError("You're not currently pending on this booking.");
    }
    // Refuse self-delegation + delegating to someone who's already
    // an approver on this booking.
    if (args.toOperatorId === operator._id) {
      throw new ConvexError("Can't delegate to yourself.");
    }
    const existingForRecipient = (
      await ctx.db
        .query("bookingApprovals")
        .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
        .collect()
    ).find((r) => r.approverOperatorId === args.toOperatorId);
    if (existingForRecipient) {
      throw new ConvexError(
        "That operator is already an approver on this booking.",
      );
    }

    const now = Date.now();
    await ctx.db.patch(myRow._id, {
      delegatedToOperatorId: args.toOperatorId,
      delegatedAt: now,
      note: args.note?.trim() || undefined,
      // Keep decision="pending" so the audit trail shows
      // "delegated by Sarah → Bob"; the recipient's fresh row is
      // what now satisfies the approval rules.
    });
    await ctx.db.insert("bookingApprovals", {
      bookingId: args.bookingId,
      workspaceId,
      approverOperatorId: args.toOperatorId,
      decision: "pending",
      createdAt: now,
    });
    // Notify the recipient.
    const page = await ctx.db.get(booking.bookingPageId);
    await ctx.db.insert("notifications", {
      workspaceId,
      operatorId: args.toOperatorId,
      kind: "human_requested",
      severity: "warn",
      title: `Booking delegated to you — ${page?.title ?? "booking"}`,
      body: `${operator.name ?? operator.email} passed this approval to you.`,
      link: `/app/booking-pages?approval=${args.bookingId}`,
      createdAt: now,
    });
    return null;
  },
});

/**
 * Phase 2 — escalation. Cron runs this every 15 minutes. For every
 * pending approval older than the booking's
 * approvalEscalateAfterHours threshold (default 4 hours; 0 / unset
 * = disabled), push a "still waiting on you" notification to the
 * approver and stamp escalatedAt so we don't re-notify on
 * subsequent passes.
 */
export const _escalatePendingApprovals = internalMutation({
  args: {},
  returns: v.object({ escalated: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("bookingApprovals")
      .withIndex("by_decision_created", (q) => q.eq("decision", "pending"))
      .collect();

    let escalated = 0;
    for (const row of pending) {
      if (row.escalatedAt) continue; // already nudged once
      if (row.delegatedAt) continue; // delegated rows are stale

      const booking = await ctx.db.get(row.bookingId);
      if (!booking || booking.status !== "pending_approval") continue;
      const page = await ctx.db.get(booking.bookingPageId);
      if (!page) continue;
      const escalateAfterHours = page.approvalEscalateAfterHours ?? 4;
      if (escalateAfterHours <= 0) continue; // disabled for this page

      const ageMs = now - row.createdAt;
      if (ageMs < escalateAfterHours * 60 * 60 * 1000) continue;

      // Push escalation notification + stamp.
      await ctx.db.insert("notifications", {
        workspaceId: row.workspaceId,
        operatorId: row.approverOperatorId,
        kind: "human_requested",
        severity: "error",
        title: `🚨 Booking still awaiting your approval — ${page.title}`,
        body: `Pending for ${Math.round(ageMs / (60 * 60 * 1000))}h. Auto-declines if not actioned soon.`,
        link: `/app/booking-pages?approval=${row.bookingId}`,
        createdAt: now,
      });
      await ctx.db.patch(row._id, { escalatedAt: now });
      escalated++;
    }
    return { escalated };
  },
});

/**
 * Pending approvals that this operator can act on. Powers the
 * dashboard inbox row + the per-row approve/decline buttons.
 */
export const listPendingApprovals = query({
  args: { sessionToken: v.string() },
  returns: v.array(
    v.object({
      bookingId: v.id("bookings"),
      bookingPageTitle: v.string(),
      visitorName: v.string(),
      visitorEmail: v.string(),
      startsAt: v.number(),
      endsAt: v.number(),
      notes: v.union(v.string(), v.null()),
      approvalMode: v.union(v.literal("any"), v.literal("all")),
      approvalDeadlineAt: v.union(v.number(), v.null()),
      approvalsTotal: v.number(),
      approvalsApproved: v.number(),
      approvalsDeclined: v.number(),
      approvalsPending: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const myPending = await ctx.db
      .query("bookingApprovals")
      .withIndex("by_approver_pending", (q) =>
        q.eq("approverOperatorId", operator._id).eq("decision", "pending"),
      )
      .collect();
    const out: Array<{
      bookingId: Id<"bookings">;
      bookingPageTitle: string;
      visitorName: string;
      visitorEmail: string;
      startsAt: number;
      endsAt: number;
      notes: string | null;
      approvalMode: "any" | "all";
      approvalDeadlineAt: number | null;
      approvalsTotal: number;
      approvalsApproved: number;
      approvalsDeclined: number;
      approvalsPending: number;
    }> = [];
    for (const a of myPending) {
      if (a.workspaceId !== workspaceId) continue;
      const b = await ctx.db.get(a.bookingId);
      if (!b || b.status !== "pending_approval") continue;
      if (!hasBrandAccess(operator, b.brandId)) continue;
      const page = await ctx.db.get(b.bookingPageId);
      const visitor = await ctx.db.get(b.visitorId);
      const visitorName =
        (visitor && "visitorKey" in visitor ? visitor.name : null) ??
        b.visitorEmail ??
        "Anonymous";
      const all = await ctx.db
        .query("bookingApprovals")
        .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
        .collect();
      out.push({
        bookingId: b._id,
        bookingPageTitle: page?.title ?? "Untitled",
        visitorName,
        visitorEmail: b.visitorEmail ?? "",
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        notes: b.notes ?? null,
        approvalMode: b.approvalMode ?? "any",
        approvalDeadlineAt: b.approvalDeadlineAt ?? null,
        approvalsTotal: all.length,
        approvalsApproved: all.filter((x) => x.decision === "approved").length,
        approvalsDeclined: all.filter((x) => x.decision === "declined").length,
        approvalsPending: all.filter((x) => x.decision === "pending").length,
      });
    }
    return out.sort((a, b) => a.startsAt - b.startsAt);
  },
});

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Plain TS helper (not a mutation) so `book` and
 * `respondToBookingApproval` can both invoke it from inside their own
 * mutation transactions. Does the post-confirmation work: visitor
 * confirmation message, multi-attendee calendar fan-out, reminders.
 *
 * Idempotent enough — re-calling drops a second confirmation message,
 * which is undesirable but not destructive. Callers should only invoke
 * once per booking lifecycle (book-with-no-approval; or first-confirm
 * after approvals).
 */
async function finalizeBookingHelper(
  ctx: MutationCtx,
  bookingId: Id<"bookings">,
): Promise<void> {
  const booking = await ctx.db.get(bookingId);
  if (!booking) return;
  const page = await ctx.db.get(booking.bookingPageId);
  if (!page) return;
  const visitor = await ctx.db.get(booking.visitorId);
  if (!visitor || !("visitorKey" in visitor)) return;

  const ownerOp = await ctx.db.get(booking.ownerOperatorId);
  const ownerName = ownerOp?.name ?? "the team";
  const ownerEmail = ownerOp?.email ?? "noreply@praxtalk.com";
  const visitorName = visitor.name ?? "there";
  const email = booking.visitorEmail ?? visitor.email ?? "";

  // Outbound confirmation to the visitor.
  const confirmationBody = renderConfirmation({
    title: page.title,
    ownerName,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    timezone: page.timezone,
    visitorName,
  });
  const icsAttachment =
    page.confirmChannel === "email" && email
      ? [
          {
            filename: "booking.ics",
            contentBase64: btoa(
              buildICS({
                uid: `${booking.conversationId}@praxtalk`,
                title: page.title,
                description: `${page.title} with ${ownerName}.`,
                startsAt: booking.startsAt,
                endsAt: booking.endsAt,
                organizerEmail: ownerEmail,
                attendeeEmail: email,
              }),
            ),
            mimeType: "text/calendar; method=REQUEST; charset=utf-8",
          },
        ]
      : undefined;

  const confirmMsgId = await ctx.db.insert("messages", {
    conversationId: booking.conversationId,
    workspaceId: booking.workspaceId,
    brandId: booking.brandId,
    channel:
      page.confirmChannel === "email"
        ? "email"
        : page.confirmChannel === "sms"
          ? "sms"
          : "whatsapp",
    role: "atlas",
    body: confirmationBody,
    attachments: icsAttachment,
    emailSubject:
      page.confirmChannel === "email"
        ? `Booking confirmed — ${page.title}`
        : undefined,
    createdAt: Date.now(),
  });
  if (page.confirmChannel === "email") {
    await ctx.scheduler.runAfter(
      0,
      internal.emailIntegrations.sendOperatorReply,
      { messageId: confirmMsgId },
    );
  } else if (page.confirmChannel === "sms") {
    await ctx.scheduler.runAfter(
      0,
      internal.voiceIntegrations.sendSmsForMessage,
      { messageId: confirmMsgId },
    );
  }

  // Calendar write-back to the primary owner + every additional attendee.
  // Each call is idempotent on the operator+booking pair so no
  // accidental duplicate events.
  const allAttendees: Id<"operators">[] = [
    booking.ownerOperatorId,
    ...(booking.additionalAttendeeOperatorIds ?? []),
  ];
  for (const attendeeId of allAttendees) {
    await ctx.scheduler.runAfter(
      0,
      internal.calendarSync.writeBookingToCalendar,
      {
        operatorId: attendeeId,
        bookingId,
        title: `${page.title} — ${visitorName}`,
        description: `Booked via PraxTalk.\n\nVisitor: ${visitorName} <${email}>${
          booking.notes ? `\n\nNotes:\n${booking.notes}` : ""
        }`,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        attendeeEmail: email,
      },
    );
  }

  // Auto-schedule reminders. Skip ones whose computed sendAt is past.
  const now = Date.now();
  for (const offsetMin of page.reminderOffsetMin) {
    const sendAt = booking.startsAt + offsetMin * 60 * 1000;
    if (sendAt < now + 30_000) continue;
    const offsetLabel =
      offsetMin <= -1440
        ? `${Math.round(-offsetMin / 1440)} day${offsetMin <= -2880 ? "s" : ""}`
        : offsetMin <= -60
          ? `${Math.round(-offsetMin / 60)} hour${offsetMin <= -120 ? "s" : ""}`
          : `${-offsetMin} min`;
    await ctx.db.insert("reminders", {
      workspaceId: booking.workspaceId,
      brandId: booking.brandId,
      conversationId: booking.conversationId,
      visitorId: booking.visitorId,
      channel: page.confirmChannel,
      sendAt,
      body: `Reminder: your ${page.title} is in ${offsetLabel}. See you soon!`,
      status: "pending",
      scheduledByOperatorId: booking.ownerOperatorId,
      scheduledAt: now,
    });
  }
}

/**
 * Mark a booking declined + notify the visitor on the page's confirm
 * channel. Used by both auto-decline (timeout) and approver-initiated
 * decline.
 */
async function declineBookingHelper(
  ctx: MutationCtx,
  bookingId: Id<"bookings">,
  reason: string,
): Promise<void> {
  const booking = await ctx.db.get(bookingId);
  if (!booking) return;
  const page = await ctx.db.get(booking.bookingPageId);
  if (!page) return;

  await ctx.db.patch(bookingId, {
    status: "declined",
    declineReason: reason,
    finalizedAt: Date.now(),
  });

  // Cancel any pending approval rows so the dashboard stops showing
  // them as pending action items.
  const pendingApprovals = await ctx.db
    .query("bookingApprovals")
    .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
    .collect();
  for (const a of pendingApprovals) {
    if (a.decision === "pending") {
      await ctx.db.patch(a._id, {
        decision: "declined",
        respondedAt: Date.now(),
      });
    }
  }

  // Visitor-facing decline message.
  const visitor = await ctx.db.get(booking.visitorId);
  const visitorName =
    visitor && "visitorKey" in visitor ? (visitor.name ?? "there") : "there";
  const declineBody = renderDecline({
    title: page.title,
    visitorName,
    startsAt: booking.startsAt,
    timezone: page.timezone,
    reason,
  });
  const channel =
    page.confirmChannel === "email"
      ? "email"
      : page.confirmChannel === "sms"
        ? "sms"
        : "whatsapp";
  const declineMsgId = await ctx.db.insert("messages", {
    conversationId: booking.conversationId,
    workspaceId: booking.workspaceId,
    brandId: booking.brandId,
    channel,
    role: "atlas",
    body: declineBody,
    emailSubject:
      page.confirmChannel === "email"
        ? `Booking declined — ${page.title}`
        : undefined,
    createdAt: Date.now(),
  });
  if (page.confirmChannel === "email") {
    await ctx.scheduler.runAfter(
      0,
      internal.emailIntegrations.sendOperatorReply,
      { messageId: declineMsgId },
    );
  } else if (page.confirmChannel === "sms") {
    await ctx.scheduler.runAfter(
      0,
      internal.voiceIntegrations.sendSmsForMessage,
      { messageId: declineMsgId },
    );
  }
}

function renderPending(args: {
  title: string;
  startsAt: number;
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
  return `Hi ${args.visitorName},

We've received your request for "${args.title}" on ${when}.

A team member will review your request and get back to you shortly to confirm. You'll get another email once it's approved.

Thanks for your patience!`;
}

function renderDecline(args: {
  title: string;
  visitorName: string;
  startsAt: number;
  timezone: string;
  reason: string;
}): string {
  const when = new Date(args.startsAt).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return `Hi ${args.visitorName},

Unfortunately we're unable to confirm your "${args.title}" booking for ${when}.

${args.reason}

You're welcome to pick a different slot — just reply or revisit the booking page. Sorry for the inconvenience!`;
}

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
