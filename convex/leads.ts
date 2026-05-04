import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOperator } from "./auth";
import { getDefaultBrandId, hasBrandAccess } from "./brands";
import { pushActivity } from "./notifications";
import { fireEvent } from "./webhooks";

const leadStatuses = [
  v.literal("new"),
  v.literal("contacted"),
  v.literal("qualified"),
  v.literal("won"),
  v.literal("lost"),
] as const;

const leadStatusValidator = v.union(...leadStatuses);

const leadLocationValidator = v.object({
  country: v.optional(v.string()),
  countryCode: v.optional(v.string()),
  region: v.optional(v.string()),
  city: v.optional(v.string()),
  timezone: v.optional(v.string()),
});

/**
 * List leads visible to the caller. Optionally filter by status and brand.
 * Newest activity first.
 */
export const list = query({
  args: {
    sessionToken: v.string(),
    status: v.optional(leadStatusValidator),
    brandId: v.optional(v.id("brands")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const limit = Math.min(args.limit ?? 100, 500);

    // Brand index by id for hydration + access checks.
    const allBrands = await ctx.db
      .query("brands")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const brandIndex = new Map(allBrands.map((b) => [b._id, b]));

    let leads;
    const brandId = args.brandId;
    const status = args.status;
    if (brandId) {
      if (!hasBrandAccess(operator, brandId)) return [];
      if (status) {
        leads = await ctx.db
          .query("leads")
          .withIndex("by_brand_status_updated", (qb) =>
            qb.eq("brandId", brandId).eq("status", status),
          )
          .order("desc")
          .take(limit);
      } else {
        leads = await ctx.db
          .query("leads")
          .withIndex("by_brand_status_updated", (qb) =>
            qb.eq("brandId", brandId),
          )
          .order("desc")
          .take(limit);
      }
    } else if (status) {
      leads = await ctx.db
        .query("leads")
        .withIndex("by_workspace_status_updated", (qb) =>
          qb.eq("workspaceId", workspaceId).eq("status", status),
        )
        .order("desc")
        .take(limit);
    } else {
      leads = await ctx.db
        .query("leads")
        .withIndex("by_workspace_status_updated", (qb) =>
          qb.eq("workspaceId", workspaceId),
        )
        .order("desc")
        .take(limit);
    }

    // Filter to only brands the operator can see.
    leads = leads.filter(
      (l) => !l.brandId || hasBrandAccess(operator, l.brandId),
    );

    // Hydrate assignee operator name + email so the table can render
    // "Assigned to Jane Doe" without an extra round-trip per row.
    const assigneeIds = new Set(
      leads
        .map((l) => l.assignedToOperatorId)
        .filter((id): id is Id<"operators"> => !!id),
    );
    const assigneeIndex = new Map<
      string,
      { _id: Id<"operators">; name: string; email: string }
    >();
    for (const id of assigneeIds) {
      const op = await ctx.db.get(id);
      if (op) {
        assigneeIndex.set(op._id, {
          _id: op._id,
          name: op.name,
          email: op.email,
        });
      }
    }

    return leads.map((l) => ({
      ...l,
      brand: l.brandId
        ? (() => {
            const b = brandIndex.get(l.brandId);
            return b
              ? { _id: b._id, name: b.name, primaryColor: b.primaryColor }
              : null;
          })()
        : null,
      assignedTo: l.assignedToOperatorId
        ? assigneeIndex.get(l.assignedToOperatorId) ?? null
        : null,
    }));
  },
});

/**
 * Get a single lead by id.
 */
export const getById = query({
  args: { sessionToken: v.string(), leadId: v.id("leads") },
  handler: async (ctx, { sessionToken, leadId }) => {
    const { operator, workspaceId } = await requireOperator(ctx, sessionToken);
    const lead = await ctx.db.get(leadId);
    if (!lead || lead.workspaceId !== workspaceId) return null;
    if (lead.brandId && !hasBrandAccess(operator, lead.brandId)) return null;
    return lead;
  },
});

/**
 * Promote a visitor / conversation into a lead. The operator can edit
 * any field before saving — values default to whatever's on the visitor.
 */
export const create = mutation({
  args: {
    sessionToken: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(leadStatusValidator),
    conversationId: v.optional(v.id("conversations")),
    visitorId: v.optional(v.id("visitors")),
    brandId: v.optional(v.id("brands")),
  },
  returns: v.object({ leadId: v.id("leads") }),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const name = args.name.trim();
    if (!name) throw new Error("Lead name is required.");

    let brandId: Id<"brands"> | undefined = args.brandId;
    let location = undefined;
    let ip = undefined;
    let visitorId = args.visitorId;
    let conversationId = args.conversationId;

    // If pulling from a conversation, derive brand + visitor + geo data
    // and verify everything is in this workspace.
    if (conversationId) {
      const convo = await ctx.db.get(conversationId);
      if (!convo || convo.workspaceId !== workspaceId) {
        throw new Error("Conversation not found.");
      }
      if (!hasBrandAccess(operator, convo.brandId)) {
        throw new Error("No access to this brand.");
      }
      brandId = brandId ?? convo.brandId;
      visitorId = visitorId ?? convo.visitorId;
    }
    if (visitorId) {
      const visitor = await ctx.db.get(visitorId);
      if (visitor && visitor.workspaceId === workspaceId) {
        brandId = brandId ?? visitor.brandId;
        location = visitor.location
          ? {
              country: visitor.location.country,
              countryCode: visitor.location.countryCode,
              region: visitor.location.region,
              city: visitor.location.city,
              timezone: visitor.location.timezone,
            }
          : undefined;
        ip = visitor.ip;
      }
    }
    // Fall back to the workspace's default brand if neither the
    // conversation nor visitor pinned one (e.g. operator created lead
    // from scratch with no source).
    if (!brandId) {
      brandId = await getDefaultBrandId(ctx, workspaceId);
    }
    if (!hasBrandAccess(operator, brandId)) {
      throw new Error("No access to this brand.");
    }

    const now = Date.now();
    const leadId = await ctx.db.insert("leads", {
      workspaceId,
      brandId,
      conversationId,
      visitorId,
      name,
      email: args.email,
      phone: args.phone,
      location,
      ip,
      status: args.status ?? "new",
      notes: args.notes,
      createdBy: operator._id,
      createdAt: now,
      updatedAt: now,
    });

    await fireEvent(ctx, workspaceId, "lead.created", {
      leadId,
      conversationId,
      brandId,
      name,
      email: args.email,
      phone: args.phone,
      location,
      status: args.status ?? "new",
    });

    await pushActivity(ctx, {
      workspaceId,
      kind: "lead_created",
      severity: "success",
      title: `New lead: ${name}`,
      body: args.email ?? args.phone ?? undefined,
      link: "/app/leads",
    });

    return { leadId };
  },
});

/**
 * Update lead status (e.g. new → contacted → qualified → won/lost).
 */
export const updateStatus = mutation({
  args: {
    sessionToken: v.string(),
    leadId: v.id("leads"),
    status: leadStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.workspaceId !== workspaceId) {
      throw new Error("Lead not found.");
    }
    if (lead.brandId && !hasBrandAccess(operator, lead.brandId)) {
      throw new Error("No access to this brand.");
    }
    await ctx.db.patch(args.leadId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    await fireEvent(ctx, workspaceId, "lead.status_changed", {
      leadId: args.leadId,
      previousStatus: lead.status,
      status: args.status,
    });
    return null;
  },
});

/**
 * Assign a lead to an operator, or unassign by passing null.
 *
 * Owners + admins can assign anyone in the workspace. Agents can only
 * assign to themselves (self-claim) — they shouldn't be reorganising
 * the team's pipeline. Brand-scoped agents must also have access to
 * the lead's brand.
 */
export const assign = mutation({
  args: {
    sessionToken: v.string(),
    leadId: v.id("leads"),
    operatorId: v.union(v.id("operators"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.workspaceId !== workspaceId) {
      throw new Error("Lead not found.");
    }
    if (lead.brandId && !hasBrandAccess(operator, lead.brandId)) {
      throw new Error("No access to this brand.");
    }
    if (operator.role === "agent") {
      // Agents can self-claim or unclaim themselves; nothing else.
      const isSelf = args.operatorId === operator._id;
      const isUnclaimSelf =
        args.operatorId === null && lead.assignedToOperatorId === operator._id;
      if (!isSelf && !isUnclaimSelf) {
        throw new Error(
          "Agents can only assign leads to themselves. Ask an admin to reassign.",
        );
      }
    }
    if (args.operatorId) {
      const target = await ctx.db.get(args.operatorId);
      if (!target || target.workspaceId !== workspaceId) {
        throw new Error("Assignee must be a teammate in this workspace.");
      }
      // Brand-scoped operators can't be assigned a lead they couldn't
      // open anyway — block at assign time so the pipeline stays
      // workable.
      if (lead.brandId && !hasBrandAccess(target, lead.brandId)) {
        throw new Error(
          "That teammate doesn't have access to this lead's brand.",
        );
      }
    }
    const now = Date.now();
    await ctx.db.patch(args.leadId, {
      assignedToOperatorId: args.operatorId ?? undefined,
      assignedAt: args.operatorId ? now : undefined,
      assignedByOperatorId: args.operatorId ? operator._id : undefined,
      updatedAt: now,
    });
    await fireEvent(ctx, workspaceId, "lead.assigned", {
      leadId: args.leadId,
      assigneeOperatorId: args.operatorId,
      previousAssigneeOperatorId: lead.assignedToOperatorId ?? null,
    });
    return null;
  },
});

/**
 * Update arbitrary lead fields (notes, name, contact info).
 */
export const update = mutation({
  args: {
    sessionToken: v.string(),
    leadId: v.id("leads"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.workspaceId !== workspaceId) {
      throw new Error("Lead not found.");
    }
    if (lead.brandId && !hasBrandAccess(operator, lead.brandId)) {
      throw new Error("No access to this brand.");
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Lead name cannot be empty.");
      patch.name = name;
    }
    if (args.email !== undefined) patch.email = args.email;
    if (args.phone !== undefined) patch.phone = args.phone;
    if (args.notes !== undefined) patch.notes = args.notes;
    await ctx.db.patch(args.leadId, patch);
    return null;
  },
});

/**
 * Delete a lead. Owner / admin only.
 */
export const remove = mutation({
  args: { sessionToken: v.string(), leadId: v.id("leads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error("Only admins and owners can delete leads.");
    }
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.workspaceId !== workspaceId) {
      throw new Error("Lead not found.");
    }
    await ctx.db.delete(args.leadId);
    return null;
  },
});

/**
 * Helper for the inbox UI: returns whether the current conversation has
 * already been saved as a lead (so the button can show "View lead"
 * instead of "Save as Lead").
 */
export const findByConversation = query({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .first();
    if (!lead || lead.workspaceId !== workspaceId) return null;
    if (lead.brandId && !hasBrandAccess(operator, lead.brandId)) return null;
    return lead;
  },
});
