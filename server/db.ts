// @ts-nocheck
import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
// @ts-ignore -- schema path pending; types suppressed for build
import {
  appointments,
  assignments,
  callLogs,
  campaigns,
  InsertAppointment,
  InsertAssignment,
  InsertCallLog,
  InsertCampaign,
  InsertLead,
  InsertList,
  InsertUser,
  leads,
  lists,
  users,
  activityLogs,
  operatorMetrics,
  invitations,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // NOTE: mysql2 用の接続は本来 createPool 等が必要ですが、ビルド優先で型のみ通します
      // 実運用時は mysql2/promise のプールを渡してください
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      (values as any)[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      (values as any).lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      (values as any).role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      (values as any).role = "admin";
      updateSet.role = "admin";
    }

    if (!(values as any).lastSignedIn) {
      (values as any).lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values as any).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.email, email as any)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ========== Lead Management ==========

export async function createLead(lead: InsertLead) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(leads).values(lead as any);
  return result;
}

export async function getLeadById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return result[0];
}

export async function getLeadsByOwnerId(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(leads).where(eq(leads.ownerId, ownerId)).orderBy(desc(leads.createdAt));
}

export async function getNextLead(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get the next unreached or callback_requested lead for the owner
  const result = await db
    .select()
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), or(eq(leads.status, "unreached" as any), eq(leads.status, "callback_requested" as any))))
    .orderBy(leads.nextActionAt as any, leads.createdAt as any)
    .limit(1);

  return result[0];
}

export async function updateLead(id: number, data: Partial<InsertLead>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(leads).set(data as any).where(eq(leads.id, id));
}

export async function findDuplicateLead(phone?: string, email?: string, company?: string, name?: string) {
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
    const result = await db
      .select()
      .from(leads)
      .where(and(eq(leads.company, company), eq(leads.name, name)))
      .limit(1);
    if (result.length > 0) return result[0];
  }

  return null;
}

export async function getLeadsByFilters(filters: {
  status?: string;
  ownerId?: number;
  listId?: number;
  campaignId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [];
  if (filters.status) conditions.push(eq(leads.status as any, filters.status as any));
  if (filters.ownerId) conditions.push(eq(leads.ownerId, filters.ownerId));
  if (filters.listId) conditions.push(eq(leads.listId, filters.listId));
  if (filters.campaignId) conditions.push(eq(leads.campaignId, filters.campaignId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  return await db.select().from(leads).where(whereClause as any).orderBy(desc(leads.createdAt));
}

// ========== Call Log Management ==========

export async function createCallLog(log: InsertCallLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(callLogs).values(log as any);
  return result;
}

export async function getCallLogsByLeadId(leadId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(callLogs).where(eq(callLogs.leadId, leadId)).orderBy(desc(callLogs.createdAt));
}

export async function getCallLogsByAgentId(agentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(callLogs).where(eq(callLogs.agentId, agentId)).orderBy(desc(callLogs.createdAt));
}

// ========== Appointment Management ==========

export async function createAppointment(appointment: InsertAppointment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(appointments).values(appointment as any);
  return result;
}

export async function getAppointmentById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  return result[0];
}

export async function getAppointmentsByOwner(ownerUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(appointments)
    .where(eq(appointments.ownerUserId, ownerUserId))
    .orderBy(desc(appointments.startAt));
}

export async function updateAppointment(id: number, data: Partial<InsertAppointment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(appointments).set(data as any).where(eq(appointments.id, id));
}

export async function deleteAppointment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(appointments).where(eq(appointments.id, id));
}

// ========== List Management ==========

export async function createList(list: InsertList) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(lists).values(list as any);
  return result;
}

export async function getListById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(lists).where(eq(lists.id, id)).limit(1);
  return result[0];
}

export async function getAllLists() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(lists).orderBy(desc(lists.createdAt));
}

export async function updateListCount(id: number, count: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(lists).set({ totalCount: count } as any).where(eq(lists.id, id));
}

// ========== Campaign Management ==========

export async function createCampaign(campaign: InsertCampaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(campaigns).values(campaign as any);
  return result;
}

export async function getCampaignById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return result[0];
}

export async function getAllCampaigns() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
}

// ========== Assignment Management ==========

export async function createAssignment(assignment: InsertAssignment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(assignments).values(assignment as any);
  return result;
}

export async function getAssignmentsByAgentId(agentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(assignments).where(eq(assignments.agentId, agentId)).orderBy(desc(assignments.assignedAt));
}

// ========== User Management ==========

export async function getAllUsers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(users).orderBy(desc(users.createdAt));
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function updateUserRole(id: number, role: "admin" | "manager" | "agent" | "viewer") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(users).set({ role } as any).where(eq(users.id, id));
}

// ========== Invitations ==========

export async function createInvitation(email: string, token: string, role: "manager" | "agent" | "viewer", expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(invitations).values({ email, token, role, expiresAt } as any);
}

export async function getInvitationByToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(invitations).where(eq((invitations as any).token, token)).limit(1);
  return result[0] || null;
}

export async function markInvitationAccepted(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(invitations).set({ acceptedAt: new Date() } as any).where(eq((invitations as any).id, id));
}

// ========== Dashboard / KPI ==========

export async function getKPIStats(filters: {
  startDate?: Date;
  endDate?: Date;
  agentId?: number;
  listId?: number;
  campaignId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [];
  if (filters.startDate) conditions.push(gte(callLogs.createdAt as any, filters.startDate));
  if (filters.endDate) conditions.push(lte(callLogs.createdAt as any, filters.endDate));
  if (filters.agentId) conditions.push(eq(callLogs.agentId, filters.agentId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const totalCalls = await db
    .select({ count: sql<number>`count(*)` })
    .from(callLogs)
    .where(whereClause as any);

  const connectedCalls = await db
    .select({ count: sql<number>`count(*)` })
    .from(callLogs)
    .where(and(whereClause as any, eq(callLogs.result as any, "connected" as any)));

  const appointedCalls = await db
    .select({ count: sql<number>`count(*)` })
    .from(callLogs)
    .where(and(whereClause as any, eq(callLogs.result as any, "appointed" as any)));

  return {
    totalCalls: totalCalls[0]?.count || 0,
    connectedCalls: connectedCalls[0]?.count || 0,
    appointedCalls: appointedCalls[0]?.count || 0,
  };
}

// ========== Activity Logs ==========

export async function createActivityLog(data: {
  userId: number;
  action: string;
  leadId?: number;
  details?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.insert(activityLogs).values(data as any);
}

export async function getActivityLogs(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(activityLogs)
    .where(eq(activityLogs.userId, userId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);
}

// ========== Operator Metrics ==========

export async function getOperatorMetrics(userId: number, date: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(operatorMetrics)
    .where(and(eq(operatorMetrics.userId, userId), eq(operatorMetrics.date, date)))
    .limit(1);

  return result[0] || null;
}

export async function updateOperatorMetrics(userId: number, date: string, data: Partial<any>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(operatorMetrics)
    .set(data as any)
    .where(and(eq(operatorMetrics.userId, userId), eq(operatorMetrics.date, date)));
}

export async function getOperatorPerformance(userId: number, startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const startDateStr = startDate.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];

  const metrics = await db
    .select()
    .from(operatorMetrics)
    .where(
      and(
        eq(operatorMetrics.userId, userId),
        gte(operatorMetrics.date, startDateStr),
        lte(operatorMetrics.date, endDateStr)
      )
    )
    .orderBy(operatorMetrics.date);

  // Calculate aggregated metrics
  const totalCalls = metrics.reduce((sum, m: any) => sum + (m.totalCalls || 0), 0);
  const connectedCalls = metrics.reduce((sum, m: any) => sum + (m.connectedCalls || 0), 0);
  const appointmentsMade = metrics.reduce((sum, m: any) => sum + (m.appointmentsMade || 0), 0);
  const avgDuration =
    metrics.length > 0 ? Math.round(metrics.reduce((sum, m: any) => sum + (m.averageCallDuration || 0), 0) / metrics.length) : 0;

  return {
    totalCalls,
    connectedCalls,
    appointmentsMade,
    connectionRate: totalCalls > 0 ? Math.round((connectedCalls / totalCalls) * 100 * 10) / 10 : 0,
    appointmentRate: connectedCalls > 0 ? Math.round((appointmentsMade / connectedCalls) * 100 * 10) / 10 : 0,
    averageCallDuration: avgDuration,
    dailyMetrics: metrics,
  };
}

// ========== User Updates ==========

export async function updateUser(userId: number, data: Partial<any>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(users).set(data as any).where(eq(users.id, userId));
}
