// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/db.ts
import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin", "manager", "agent", "viewer"]).default("agent").notNull(),
  // Google Calendar integration
  googleAccessToken: text("googleAccessToken"),
  googleRefreshToken: text("googleRefreshToken"),
  googleCalendarId: varchar("googleCalendarId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var leadStatusEnum = mysqlEnum("lead_status", [
  "unreached",
  "connected",
  "no_answer",
  "callback_requested",
  "retry_waiting",
  "ng",
  "considering",
  "appointed",
  "lost"
]);
var leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }),
  phone: varchar("phone", { length: 32 }).notNull(),
  email: varchar("email", { length: 320 }),
  prefecture: varchar("prefecture", { length: 64 }),
  industry: varchar("industry", { length: 128 }),
  memo: text("memo"),
  status: leadStatusEnum.default("unreached").notNull(),
  customStatus: varchar("customStatus", { length: 128 }),
  // Allow custom status
  ownerId: int("ownerId"),
  nextActionAt: timestamp("nextActionAt"),
  listId: int("listId"),
  campaignId: int("campaignId"),
  lastContactedAt: timestamp("lastContactedAt"),
  // Track last contact time
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var callLogs = mysqlTable("call_logs", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  agentId: int("agentId").notNull(),
  result: leadStatusEnum.notNull(),
  memo: text("memo"),
  nextActionAt: timestamp("nextActionAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var appointmentStatusEnum = mysqlEnum("appointment_status", [
  "scheduled",
  "confirmed",
  "cancelled",
  "completed"
]);
var appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  ownerUserId: int("ownerUserId").notNull(),
  status: appointmentStatusEnum.default("scheduled").notNull(),
  startAt: timestamp("startAt").notNull(),
  endAt: timestamp("endAt").notNull(),
  title: varchar("title", { length: 512 }),
  description: text("description"),
  googleCalendarId: varchar("googleCalendarId", { length: 255 }),
  googleEventId: varchar("googleEventId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var lists = mysqlTable("lists", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  totalCount: int("totalCount").default(0).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var assignments = mysqlTable("assignments", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  agentId: int("agentId").notNull(),
  assignedBy: int("assignedBy").notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull()
});
var activityLogs = mysqlTable("activity_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  // e.g., "call", "appointment_created", "status_changed"
  leadId: int("leadId"),
  details: text("details"),
  // JSON string for additional details
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var operatorMetrics = mysqlTable("operator_metrics", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  // YYYY-MM-DD format
  totalCalls: int("totalCalls").default(0).notNull(),
  connectedCalls: int("connectedCalls").default(0).notNull(),
  appointmentsMade: int("appointmentsMade").default(0).notNull(),
  averageCallDuration: int("averageCallDuration").default(0).notNull(),
  // in seconds
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdBy: int("createdBy").notNull(),
  // Admin who created the project
  status: mysqlEnum("project_status", ["active", "archived", "inactive"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var projectMembers = mysqlTable("project_members", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("member_role", ["owner", "manager", "agent", "viewer"]).default("agent").notNull(),
  addedBy: int("addedBy").notNull(),
  addedAt: timestamp("addedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var listsUpdated = mysqlTable("lists_updated", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  totalCount: int("totalCount").default(0).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var campaignsUpdated = mysqlTable("campaigns_updated", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function createLead(lead) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(leads).values(lead);
  return result;
}
async function getLeadById(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return result[0];
}
async function getLeadsByOwnerId(ownerId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(leads).where(eq(leads.ownerId, ownerId)).orderBy(desc(leads.createdAt));
}
async function getNextLead(ownerId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(leads).where(and(eq(leads.ownerId, ownerId), or(eq(leads.status, "unreached"), eq(leads.status, "callback_requested")))).orderBy(leads.nextActionAt, leads.createdAt).limit(1);
  return result[0];
}
async function updateLead(id, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leads).set(data).where(eq(leads.id, id));
}
async function findDuplicateLead(phone, email, company, name) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (phone) {
    const result = await db.select().from(leads).where(eq(leads.phone, phone)).limit(1);
    if (result.length > 0) return result[0];
  }
  if (email) {
    const result = await db.select().from(leads).where(eq(leads.email, email)).limit(1);
    if (result.length > 0) return result[0];
  }
  if (company && name) {
    const result = await db.select().from(leads).where(and(eq(leads.company, company), eq(leads.name, name))).limit(1);
    if (result.length > 0) return result[0];
  }
  return null;
}
async function getLeadsByFilters(filters) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [];
  if (filters.status) conditions.push(eq(leads.status, filters.status));
  if (filters.ownerId) conditions.push(eq(leads.ownerId, filters.ownerId));
  if (filters.listId) conditions.push(eq(leads.listId, filters.listId));
  if (filters.campaignId) conditions.push(eq(leads.campaignId, filters.campaignId));
  const whereClause = conditions.length > 0 ? and(...conditions) : void 0;
  return await db.select().from(leads).where(whereClause).orderBy(desc(leads.createdAt));
}
async function createCallLog(log) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(callLogs).values(log);
  return result;
}
async function getCallLogsByLeadId(leadId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(callLogs).where(eq(callLogs.leadId, leadId)).orderBy(desc(callLogs.createdAt));
}
async function getCallLogsByAgentId(agentId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(callLogs).where(eq(callLogs.agentId, agentId)).orderBy(desc(callLogs.createdAt));
}
async function createAppointment(appointment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(appointments).values(appointment);
  return result;
}
async function getAppointmentById(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  return result[0];
}
async function getAppointmentsByOwner(ownerUserId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(appointments).where(eq(appointments.ownerUserId, ownerUserId)).orderBy(desc(appointments.startAt));
}
async function updateAppointment(id, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(appointments).set(data).where(eq(appointments.id, id));
}
async function deleteAppointment(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(appointments).where(eq(appointments.id, id));
}
async function createList(list) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(lists).values(list);
  return result;
}
async function getListById(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(lists).where(eq(lists.id, id)).limit(1);
  return result[0];
}
async function getAllLists() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(lists).orderBy(desc(lists.createdAt));
}
async function createCampaign(campaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(campaigns).values(campaign);
  return result;
}
async function getCampaignById(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return result[0];
}
async function getAllCampaigns() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
}
async function createAssignment(assignment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(assignments).values(assignment);
  return result;
}
async function getAllUsers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(users).orderBy(desc(users.createdAt));
}
async function updateUserRole(id, role) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, id));
}
async function getKPIStats(filters) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [];
  if (filters.startDate) conditions.push(gte(callLogs.createdAt, filters.startDate));
  if (filters.endDate) conditions.push(lte(callLogs.createdAt, filters.endDate));
  if (filters.agentId) conditions.push(eq(callLogs.agentId, filters.agentId));
  const whereClause = conditions.length > 0 ? and(...conditions) : void 0;
  const totalCalls = await db.select({ count: sql`count(*)` }).from(callLogs).where(whereClause);
  const connectedCalls = await db.select({ count: sql`count(*)` }).from(callLogs).where(and(whereClause, eq(callLogs.result, "connected")));
  const appointedCalls = await db.select({ count: sql`count(*)` }).from(callLogs).where(and(whereClause, eq(callLogs.result, "appointed")));
  return {
    totalCalls: totalCalls[0]?.count || 0,
    connectedCalls: connectedCalls[0]?.count || 0,
    appointedCalls: appointedCalls[0]?.count || 0
  };
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { z as z2 } from "zod";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
var adminProcedure2 = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError3({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});
var managerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "manager") {
    throw new TRPCError3({ code: "FORBIDDEN", message: "Manager access required" });
  }
  return next({ ctx });
});
var agentProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role === "viewer") {
    throw new TRPCError3({ code: "FORBIDDEN", message: "Agent access required" });
  }
  return next({ ctx });
});
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  // ========== Lead Management ==========
  leads: router({
    // Get next lead for agent
    getNext: agentProcedure.query(async ({ ctx }) => {
      const lead = await getNextLead(ctx.user.id);
      return lead || null;
    }),
    // Get lead by ID
    getById: protectedProcedure.input(z2.object({ id: z2.number() })).query(async ({ input }) => {
      return await getLeadById(input.id);
    }),
    // Get leads by filters
    list: protectedProcedure.input(
      z2.object({
        status: z2.enum(["unreached", "connected", "no_answer", "callback_requested", "retry_waiting", "ng", "considering", "appointed", "lost"]).optional(),
        ownerId: z2.number().optional(),
        listId: z2.number().optional(),
        campaignId: z2.number().optional()
      })
    ).query(async ({ input }) => {
      return await getLeadsByFilters(input);
    }),
    // Get leads assigned to current user
    myLeads: agentProcedure.query(async ({ ctx }) => {
      return await getLeadsByOwnerId(ctx.user.id);
    }),
    // Update lead
    update: agentProcedure.input(
      z2.object({
        id: z2.number(),
        status: z2.enum(["unreached", "connected", "no_answer", "callback_requested", "retry_waiting", "ng", "considering", "appointed", "lost"]).optional(),
        memo: z2.string().optional(),
        nextActionAt: z2.date().optional(),
        ownerId: z2.number().optional()
      })
    ).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateLead(id, data);
      return { success: true };
    }),
    // Import leads from CSV
    import: managerProcedure.input(
      z2.object({
        leads: z2.array(
          z2.object({
            name: z2.string(),
            company: z2.string().optional(),
            phone: z2.string(),
            email: z2.string().optional(),
            prefecture: z2.string().optional(),
            industry: z2.string().optional(),
            memo: z2.string().optional()
          })
        ),
        listId: z2.number().optional(),
        campaignId: z2.number().optional()
      })
    ).mutation(async ({ input }) => {
      let successCount = 0;
      let duplicateCount = 0;
      for (const leadData of input.leads) {
        const duplicate = await findDuplicateLead(
          leadData.phone,
          leadData.email,
          leadData.company,
          leadData.name
        );
        if (duplicate) {
          duplicateCount++;
          continue;
        }
        await createLead({
          ...leadData,
          listId: input.listId,
          campaignId: input.campaignId,
          status: "unreached"
        });
        successCount++;
      }
      return { successCount, duplicateCount };
    }),
    // Assign leads to agents
    assign: managerProcedure.input(
      z2.object({
        leadIds: z2.array(z2.number()),
        agentId: z2.number()
      })
    ).mutation(async ({ input, ctx }) => {
      for (const leadId of input.leadIds) {
        await updateLead(leadId, { ownerId: input.agentId });
        await createAssignment({
          leadId,
          agentId: input.agentId,
          assignedBy: ctx.user.id
        });
      }
      return { success: true };
    })
  }),
  // ========== Call Log Management ==========
  callLogs: router({
    // Create call log
    create: agentProcedure.input(
      z2.object({
        leadId: z2.number(),
        result: z2.enum([
          "unreached",
          "connected",
          "no_answer",
          "callback_requested",
          "retry_waiting",
          "ng",
          "considering",
          "appointed",
          "lost"
        ]),
        memo: z2.string().optional(),
        nextActionAt: z2.date().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      await createCallLog({
        leadId: input.leadId,
        agentId: ctx.user.id,
        result: input.result,
        memo: input.memo,
        nextActionAt: input.nextActionAt
      });
      await updateLead(input.leadId, {
        status: input.result,
        nextActionAt: input.nextActionAt
      });
      return { success: true };
    }),
    // Get call logs by lead
    getByLead: protectedProcedure.input(z2.object({ leadId: z2.number() })).query(async ({ input }) => {
      return await getCallLogsByLeadId(input.leadId);
    }),
    // Get call logs by agent
    getByAgent: protectedProcedure.input(z2.object({ agentId: z2.number() })).query(async ({ input }) => {
      return await getCallLogsByAgentId(input.agentId);
    })
  }),
  // ========== Appointment Management ==========
  appointments: router({
    // Create appointment
    create: agentProcedure.input(
      z2.object({
        leadId: z2.number(),
        ownerUserId: z2.number(),
        startAt: z2.date(),
        endAt: z2.date(),
        title: z2.string().optional(),
        description: z2.string().optional()
      })
    ).mutation(async ({ input }) => {
      const result = await createAppointment({
        ...input,
        status: "scheduled"
      });
      return { success: true };
    }),
    // Get appointment by ID
    getById: protectedProcedure.input(z2.object({ id: z2.number() })).query(async ({ input }) => {
      return await getAppointmentById(input.id);
    }),
    // Get appointments by owner
    getByOwner: protectedProcedure.input(z2.object({ ownerUserId: z2.number() })).query(async ({ input }) => {
      return await getAppointmentsByOwner(input.ownerUserId);
    }),
    // Update appointment
    update: agentProcedure.input(
      z2.object({
        id: z2.number(),
        status: z2.enum(["scheduled", "confirmed", "cancelled", "completed"]).optional(),
        startAt: z2.date().optional(),
        endAt: z2.date().optional(),
        title: z2.string().optional(),
        description: z2.string().optional()
      })
    ).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateAppointment(id, data);
      return { success: true };
    }),
    // Delete appointment
    delete: agentProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
      await deleteAppointment(input.id);
      return { success: true };
    })
  }),
  // ========== List Management ==========
  lists: router({
    // Create list
    create: managerProcedure.input(
      z2.object({
        name: z2.string(),
        description: z2.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const result = await createList({
        ...input,
        createdBy: ctx.user.id,
        totalCount: 0
      });
      return { success: true };
    }),
    // Get all lists
    getAll: protectedProcedure.query(async () => {
      return await getAllLists();
    }),
    // Get list by ID
    getById: protectedProcedure.input(z2.object({ id: z2.number() })).query(async ({ input }) => {
      return await getListById(input.id);
    })
  }),
  // ========== Campaign Management ==========
  campaigns: router({
    // Create campaign
    create: managerProcedure.input(
      z2.object({
        name: z2.string(),
        description: z2.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const result = await createCampaign({
        ...input,
        createdBy: ctx.user.id
      });
      return { success: true };
    }),
    // Get all campaigns
    getAll: protectedProcedure.query(async () => {
      return await getAllCampaigns();
    }),
    // Get campaign by ID
    getById: protectedProcedure.input(z2.object({ id: z2.number() })).query(async ({ input }) => {
      return await getCampaignById(input.id);
    })
  }),
  // ========== User Management ==========
  users: router({
    // Get all users (admin only)
    getAll: adminProcedure2.query(async () => {
      return await getAllUsers();
    }),
    // Update user role (admin only)
    updateRole: adminProcedure2.input(
      z2.object({
        userId: z2.number(),
        role: z2.enum(["admin", "manager", "agent", "viewer"])
      })
    ).mutation(async ({ input }) => {
      await updateUserRole(input.userId, input.role);
      return { success: true };
    })
  }),
  // ========== CSV Export ==========
  csv: router({
    // Export leads to CSV
    exportLeads: protectedProcedure.input(
      z2.object({
        status: z2.enum(["unreached", "connected", "no_answer", "callback_requested", "retry_waiting", "ng", "considering", "appointed", "lost"]).optional(),
        ownerId: z2.number().optional(),
        listId: z2.number().optional(),
        campaignId: z2.number().optional()
      })
    ).query(async ({ input }) => {
      const leads2 = await getLeadsByFilters(input);
      return leads2;
    }),
    // Get sample CSV
    getSampleCSV: publicProcedure.input(z2.object({ format: z2.enum(["csv", "xlsx"]) })).query(({ input }) => {
      const sampleData = [
        ["\u6C0F\u540D", "\u4F1A\u793E\u540D", "\u96FB\u8A71\u756A\u53F7", "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9", "\u90FD\u9053\u5E9C\u770C", "\u696D\u7A2E", "\u30E1\u30E2"],
        ["\u5C71\u7530 \u592A\u90CE", "\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB", "03-1234-5678", "yamada@sample.co.jp", "\u6771\u4EAC\u90FD", "IT", "\u30C6\u30B9\u30C8\u30C7\u30FC\u30BF1"],
        ["\u4F50\u85E4 \u82B1\u5B50", "\u30C6\u30B9\u30C8\u5546\u4E8B", "06-9876-5432", "sato@test.co.jp", "\u5927\u962A\u5E9C", "\u88FD\u9020\u696D", "\u30C6\u30B9\u30C8\u30C7\u30FC\u30BF2"],
        ["\u9234\u6728 \u4E00\u90CE", "\u30B5\u30F3\u30D7\u30EB\u5DE5\u696D", "052-1111-2222", "suzuki@sample.jp", "\u611B\u77E5\u770C", "\u30B5\u30FC\u30D3\u30B9\u696D", "\u30C6\u30B9\u30C8\u30C7\u30FC\u30BF3"]
      ];
      if (input.format === "xlsx") {
        return {
          content: "Placeholder for XLSX binary data",
          filename: "sample_leads.xlsx"
        };
      }
      const csvContent = sampleData.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
      const bom = "\uFEFF";
      return {
        content: bom + csvContent,
        filename: "sample_leads.csv"
      };
    })
  }),
  // ========== Dashboard / KPI ==========
  dashboard: router({
    // Get KPI statistics
    getKPI: protectedProcedure.input(
      z2.object({
        startDate: z2.date(),
        endDate: z2.date(),
        agentId: z2.number().optional()
      })
    ).query(async ({ input }) => {
      const stats = await getKPIStats(input);
      const connectionRate = stats.totalCalls > 0 ? stats.connectedCalls / stats.totalCalls * 100 : 0;
      const appointmentRate = stats.connectedCalls > 0 ? stats.appointedCalls / stats.connectedCalls * 100 : 0;
      return {
        totalCalls: stats.totalCalls,
        connectedCalls: stats.connectedCalls,
        appointedCalls: stats.appointedCalls,
        connectionRate: Math.round(connectionRate * 10) / 10,
        appointmentRate: Math.round(appointmentRate * 10) / 10
      };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
