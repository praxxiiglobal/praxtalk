/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _admin from "../_admin.js";
import type * as analytics from "../analytics.js";
import type * as apiKeys from "../apiKeys.js";
import type * as atlas from "../atlas.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as bookingPages from "../bookingPages.js";
import type * as brands from "../brands.js";
import type * as calendarConnections from "../calendarConnections.js";
import type * as calendarSync from "../calendarSync.js";
import type * as conversationTags from "../conversationTags.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as emailIntegrations from "../emailIntegrations.js";
import type * as emailSmtpImap from "../emailSmtpImap.js";
import type * as http from "../http.js";
import type * as integrationGrants from "../integrationGrants.js";
import type * as invites from "../invites.js";
import type * as leads from "../leads.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_businessHours from "../lib/businessHours.js";
import type * as lib_features from "../lib/features.js";
import type * as lib_paypal from "../lib/paypal.js";
import type * as lib_platformAdmin from "../lib/platformAdmin.js";
import type * as lib_platformEmail from "../lib/platformEmail.js";
import type * as lib_razorpay from "../lib/razorpay.js";
import type * as lib_ssrf from "../lib/ssrf.js";
import type * as lib_workspaceExport from "../lib/workspaceExport.js";
import type * as messageDrafts from "../messageDrafts.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as operators from "../operators.js";
import type * as passwordReset from "../passwordReset.js";
import type * as pricing from "../pricing.js";
import type * as publicApi from "../publicApi.js";
import type * as pushNotifications from "../pushNotifications.js";
import type * as pushSubscriptions from "../pushSubscriptions.js";
import type * as rateLimits from "../rateLimits.js";
import type * as reminders from "../reminders.js";
import type * as savedReplies from "../savedReplies.js";
import type * as usage from "../usage.js";
import type * as visitors from "../visitors.js";
import type * as voiceIntegrations from "../voiceIntegrations.js";
import type * as webhookDedup from "../webhookDedup.js";
import type * as webhooks from "../webhooks.js";
import type * as whatsappIntegrations from "../whatsappIntegrations.js";
import type * as widgets from "../widgets.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _admin: typeof _admin;
  analytics: typeof analytics;
  apiKeys: typeof apiKeys;
  atlas: typeof atlas;
  auth: typeof auth;
  billing: typeof billing;
  bookingPages: typeof bookingPages;
  brands: typeof brands;
  calendarConnections: typeof calendarConnections;
  calendarSync: typeof calendarSync;
  conversationTags: typeof conversationTags;
  conversations: typeof conversations;
  crons: typeof crons;
  emailIntegrations: typeof emailIntegrations;
  emailSmtpImap: typeof emailSmtpImap;
  http: typeof http;
  integrationGrants: typeof integrationGrants;
  invites: typeof invites;
  leads: typeof leads;
  "lib/auth": typeof lib_auth;
  "lib/businessHours": typeof lib_businessHours;
  "lib/features": typeof lib_features;
  "lib/paypal": typeof lib_paypal;
  "lib/platformAdmin": typeof lib_platformAdmin;
  "lib/platformEmail": typeof lib_platformEmail;
  "lib/razorpay": typeof lib_razorpay;
  "lib/ssrf": typeof lib_ssrf;
  "lib/workspaceExport": typeof lib_workspaceExport;
  messageDrafts: typeof messageDrafts;
  messages: typeof messages;
  migrations: typeof migrations;
  notifications: typeof notifications;
  operators: typeof operators;
  passwordReset: typeof passwordReset;
  pricing: typeof pricing;
  publicApi: typeof publicApi;
  pushNotifications: typeof pushNotifications;
  pushSubscriptions: typeof pushSubscriptions;
  rateLimits: typeof rateLimits;
  reminders: typeof reminders;
  savedReplies: typeof savedReplies;
  usage: typeof usage;
  visitors: typeof visitors;
  voiceIntegrations: typeof voiceIntegrations;
  webhookDedup: typeof webhookDedup;
  webhooks: typeof webhooks;
  whatsappIntegrations: typeof whatsappIntegrations;
  widgets: typeof widgets;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
