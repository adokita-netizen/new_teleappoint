import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

// Role-based access control helpers
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new Error("Admin access required");
  }
  return next({ ctx });
});

const managerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "manager") {
    throw new Error("Manager access required");
  }
  return next({ ctx });
});

const agentProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role === "viewer") {
    throw new Error("Agent access required");
  }
  return next({ ctx });
});

// ========== Google Calendar Integration ==========
export const googleCalendarRouter = router({
  // Generate Google Calendar auth URL
  getAuthUrl: protectedProcedure.query(({ ctx }) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/google/callback";
    const scope = "https://www.googleapis.com/auth/calendar";
    const state = Buffer.from(JSON.stringify({ userId: ctx.user.id })).toString("base64");
    
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scope);
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    
    return { authUrl: url.toString() };
  }),

  // Check if user has Google Calendar connected
  isConnected: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.getUserById(ctx.user.id);
    return { isConnected: !!user?.googleAccessToken };
  }),

  // Disconnect Google Calendar
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await db.updateUser(ctx.user.id, {
      googleAccessToken: null,
      googleRefreshToken: null,
      googleCalendarId: null,
    });
    return { success: true };
  }),
});

// ========== Lead Status Management ==========
export const leadStatusRouter = router({
  // Update lead status with custom status option
  update: agentProcedure
    .input(
      z.object({
        leadId: z.number(),
        status: z.enum(["unreached", "connected", "no_answer", "callback_requested", "retry_waiting", "ng", "considering", "appointed", "lost"]).optional(),
        customStatus: z.string().optional(),
        memo: z.string().optional(),
        nextActionAt: z.date().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { leadId, status, customStatus, memo, nextActionAt } = input;
      
      await db.updateLead(leadId, {
        status: status || "unreached",
        customStatus: customStatus,
        memo: memo,
        nextActionAt: nextActionAt,
        lastContactedAt: new Date(),
      });

      // Log activity
      await db.createActivityLog({
        userId: ctx.user.id,
        action: "status_changed",
        leadId: leadId,
        details: JSON.stringify({ status, customStatus, memo }),
      });

      return { success: true };
    }),
});

// ========== Operator Management ==========
export const operatorsRouter = router({
  // Get all operators with their metrics
  getAll: managerProcedure.query(async () => {
    const users = await db.getAllUsers();
    const operators = users.filter((u) => u.role !== "viewer");
    
    // Get today's metrics for each operator
    const today = new Date().toISOString().split("T")[0];
    const metricsMap = new Map();
    
    for (const op of operators) {
      const metrics = await db.getOperatorMetrics(op.id, today);
      metricsMap.set(op.id, metrics);
    }
    
    return operators.map((op) => ({
      ...op,
      todayMetrics: metricsMap.get(op.id),
    }));
  }),

  // Get operator performance report
  getPerformance: managerProcedure
    .input(
      z.object({
        userId: z.number(),
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ input }) => {
      return await db.getOperatorPerformance(input.userId, input.startDate, input.endDate);
    }),

  // Get activity log for an operator
  getActivityLog: managerProcedure
    .input(
      z.object({
        userId: z.number(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      return await db.getActivityLogs(input.userId, input.limit);
    }),

  // Update operator role
  updateRole: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        role: z.enum(["admin", "manager", "agent", "viewer"]),
      })
    )
    .mutation(async ({ input }) => {
      await db.updateUserRole(input.userId, input.role);
      return { success: true };
    }),
});

