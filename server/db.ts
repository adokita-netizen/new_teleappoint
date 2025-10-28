import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
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
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
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

// ========== Lead Management ==========

export async function createLead(lead: InsertLead) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(leads).values(lead);
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
    .where(and(eq(leads.ownerId, ownerId), or(eq(leads.status, "unreached"), eq(leads.status, "callback_requested"))))
    .orderBy(leads.nextActionAt, leads.createdAt)
    .limit(1);

  return result[0];
}

export async function updateLead(id: number, data: Partial<InsertLead>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(leads).set(data).where(eq(leads.id, id));
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

  const conditions = [];
  if (filters.status) conditions.push(eq(leads.status, filters.status as any));
  if (filters.ownerId) conditions.push(eq(leads.ownerId, filters.ownerId));
  if (filters.listId) conditions.push(eq(leads.listId, filters.listId));
  if (filters.campaignId) conditions.push(eq(leads.campaignId, filters.campaignId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  return await db.select().from(leads).where(whereClause).orderBy(desc(leads.createdAt));
}

// ========== Call Log Management ==========

export async function createCallLog(log: InsertCallLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(callLogs).values(log);
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

  const result = await db.insert(appointments).values(appointment);
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

  await db.update(appointments).set(data).where(eq(appointments.id, id));
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

  const result = await db.insert(lists).values(list);
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

  await db.update(lists).set({ totalCount: count }).where(eq(lists.id, id));
}

// ========== Campaign Management ==========

export async function createCampaign(campaign: InsertCampaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(campaigns).values(campaign);
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

  const result = await db.insert(assignments).values(assignment);
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

  await db.update(users).set({ role }).where(eq(users.id, id));
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

  const conditions = [];
  if (filters.startDate) conditions.push(gte(callLogs.createdAt, filters.startDate));
  if (filters.endDate) conditions.push(lte(callLogs.createdAt, filters.endDate));
  if (filters.agentId) conditions.push(eq(callLogs.agentId, filters.agentId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const totalCalls = await db
    .select({ count: sql<number>`count(*)` })
    .from(callLogs)
    .where(whereClause);

  const connectedCalls = await db
    .select({ count: sql<number>`count(*)` })
    .from(callLogs)
    .where(and(whereClause, eq(callLogs.result, "connected")));

  const appointedCalls = await db
    .select({ count: sql<number>`count(*)` })
    .from(callLogs)
    .where(and(whereClause, eq(callLogs.result, "appointed")));

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

  return await db.insert(activityLogs).values(data);
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
    .set(data)
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
  const totalCalls = metrics.reduce((sum, m) => sum + (m.totalCalls || 0), 0);
  const connectedCalls = metrics.reduce((sum, m) => sum + (m.connectedCalls || 0), 0);
  const appointmentsMade = metrics.reduce((sum, m) => sum + (m.appointmentsMade || 0), 0);
  const avgDuration = metrics.length > 0 ? Math.round(metrics.reduce((sum, m) => sum + (m.averageCallDuration || 0), 0) / metrics.length) : 0;

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

  await db.update(users).set(data).where(eq(users.id, userId));
}

