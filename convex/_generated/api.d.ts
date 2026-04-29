/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as apiKeys from "../apiKeys.js";
import type * as atlas from "../atlas.js";
import type * as auth from "../auth.js";
import type * as brands from "../brands.js";
import type * as conversations from "../conversations.js";
import type * as emailIntegrations from "../emailIntegrations.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as leads from "../leads.js";
import type * as lib_auth from "../lib/auth.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as operators from "../operators.js";
import type * as publicApi from "../publicApi.js";
import type * as savedReplies from "../savedReplies.js";
import type * as visitors from "../visitors.js";
import type * as webhooks from "../webhooks.js";
import type * as widgets from "../widgets.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  apiKeys: typeof apiKeys;
  atlas: typeof atlas;
  auth: typeof auth;
  brands: typeof brands;
  conversations: typeof conversations;
  emailIntegrations: typeof emailIntegrations;
  http: typeof http;
  invites: typeof invites;
  leads: typeof leads;
  "lib/auth": typeof lib_auth;
  messages: typeof messages;
  migrations: typeof migrations;
  notifications: typeof notifications;
  operators: typeof operators;
  publicApi: typeof publicApi;
  savedReplies: typeof savedReplies;
  visitors: typeof visitors;
  webhooks: typeof webhooks;
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
