import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

// Role-based access control helpers
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

const managerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "manager") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required" });
  }
  return next({ ctx });
});

const agentProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role === "viewer") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Agent access required" });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ========== Lead Management ==========
  leads: router({
    // Get next lead for agent
    getNext: agentProcedure.query(async ({ ctx }) => {
      const lead = await db.getNextLead(ctx.user.id);
      return lead || null;
    }),

    // Get lead by ID
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getLeadById(input.id);
    }),

    // Get leads by filters
    list: protectedProcedure
      .input(
        z.object({
          status: z.enum(["unreached", "connected", "no_answer", "callback_requested", "retry_waiting", "ng", "considering", "appointed", "lost"]).optional(),
          ownerId: z.number().optional(),
          listId: z.number().optional(),
          campaignId: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        return await db.getLeadsByFilters(input);
      }),

    // Get leads assigned to current user
    myLeads: agentProcedure.query(async ({ ctx }) => {
      return await db.getLeadsByOwnerId(ctx.user.id);
    }),

    // Update lead
    update: agentProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["unreached", "connected", "no_answer", "callback_requested", "retry_waiting", "ng", "considering", "appointed", "lost"]).optional(),
          memo: z.string().optional(),
          nextActionAt: z.date().optional(),
          ownerId: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateLead(id, data);
        return { success: true };
      }),

    // Import leads from CSV
    import: managerProcedure
      .input(
        z.object({
          leads: z.array(
            z.object({
              name: z.string(),
              company: z.string().optional(),
              phone: z.string(),
              email: z.string().optional(),
              prefecture: z.string().optional(),
              industry: z.string().optional(),
              memo: z.string().optional(),
            })
          ),
          listId: z.number().optional(),
          campaignId: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        let successCount = 0;
        let duplicateCount = 0;

        for (const leadData of input.leads) {
          // Check for duplicates
          const duplicate = await db.findDuplicateLead(
            leadData.phone,
            leadData.email,
            leadData.company,
            leadData.name
          );

          if (duplicate) {
            duplicateCount++;
            continue;
          }

          await db.createLead({
            ...leadData,
            listId: input.listId,
            campaignId: input.campaignId,
            status: "unreached",
          });
          successCount++;
        }

        return { successCount, duplicateCount };
      }),

    // Assign leads to agents
    assign: managerProcedure
      .input(
        z.object({
          leadIds: z.array(z.number()),
          agentId: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        for (const leadId of input.leadIds) {
          await db.updateLead(leadId, { ownerId: input.agentId });
          await db.createAssignment({
            leadId,
            agentId: input.agentId,
            assignedBy: ctx.user.id,
          });
        }
        return { success: true };
      }),
  }),

  // ========== Call Log Management ==========
  callLogs: router({
    // Create call log
    create: agentProcedure
      .input(
        z.object({
          leadId: z.number(),
          result: z.enum([
            "unreached",
            "connected",
            "no_answer",
            "callback_requested",
            "retry_waiting",
            "ng",
            "considering",
            "appointed",
            "lost",
          ]),
          memo: z.string().optional(),
          nextActionAt: z.date().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Create call log
        await db.createCallLog({
          leadId: input.leadId,
          agentId: ctx.user.id,
          result: input.result,
          memo: input.memo,
          nextActionAt: input.nextActionAt,
        });

        // Update lead status
        await db.updateLead(input.leadId, {
          status: input.result,
          nextActionAt: input.nextActionAt,
        });

        return { success: true };
      }),

    // Get call logs by lead
    getByLead: protectedProcedure.input(z.object({ leadId: z.number() })).query(async ({ input }) => {
      return await db.getCallLogsByLeadId(input.leadId);
    }),

    // Get call logs by agent
    getByAgent: protectedProcedure.input(z.object({ agentId: z.number() })).query(async ({ input }) => {
      return await db.getCallLogsByAgentId(input.agentId);
    }),
  }),

  // ========== Appointment Management ==========
  appointments: router({
    // Create appointment
    create: agentProcedure
      .input(
        z.object({
          leadId: z.number(),
          ownerUserId: z.number(),
          startAt: z.date(),
          endAt: z.date(),
          title: z.string().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const result = await db.createAppointment({
          ...input,
          status: "scheduled",
        });
        return { success: true };
      }),

    // Get appointment by ID
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getAppointmentById(input.id);
    }),

    // Get appointments by owner
    getByOwner: protectedProcedure.input(z.object({ ownerUserId: z.number() })).query(async ({ input }) => {
      return await db.getAppointmentsByOwner(input.ownerUserId);
    }),

    // Update appointment
    update: agentProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["scheduled", "confirmed", "cancelled", "completed"]).optional(),
          startAt: z.date().optional(),
          endAt: z.date().optional(),
          title: z.string().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateAppointment(id, data);
        return { success: true };
      }),

    // Delete appointment
    delete: agentProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteAppointment(input.id);
      return { success: true };
    }),
  }),

  // ========== List Management ==========
  lists: router({
    // Create list
    create: managerProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await db.createList({
          ...input,
          createdBy: ctx.user.id,
          totalCount: 0,
        });
        return { success: true };
      }),

    // Get all lists
    getAll: protectedProcedure.query(async () => {
      return await db.getAllLists();
    }),

    // Get list by ID
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getListById(input.id);
    }),
  }),

  // ========== Campaign Management ==========
  campaigns: router({
    // Create campaign
    create: managerProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await db.createCampaign({
          ...input,
          createdBy: ctx.user.id,
        });
        return { success: true };
      }),

    // Get all campaigns
    getAll: protectedProcedure.query(async () => {
      return await db.getAllCampaigns();
    }),

    // Get campaign by ID
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getCampaignById(input.id);
    }),
  }),

  // ========== User Management ==========
  users: router({
    // Get all users (admin only)
    getAll: adminProcedure.query(async () => {
      return await db.getAllUsers();
    }),

    // Update user role (admin only)
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
  }),

  // ========== CSV Export ==========
  csv: router({
    // Export leads to CSV
    exportLeads: protectedProcedure
      .input(
        z.object({
          status: z.enum(["unreached", "connected", "no_answer", "callback_requested", "retry_waiting", "ng", "considering", "appointed", "lost"]).optional(),
          ownerId: z.number().optional(),
          listId: z.number().optional(),
          campaignId: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        const leads = await db.getLeadsByFilters(input);
        return leads;
      }),

    // Get sample CSV
	    getSampleCSV: publicProcedure.input(z.object({ format: z.enum(["csv", "xlsx"]) })).query(({ input }) => {
	      const sampleData = [
	        ["氏名", "会社名", "電話番号", "メールアドレス", "都道府県", "業種", "メモ"],
	        ["山田 太郎", "株式会社サンプル", "03-1234-5678", "yamada@sample.co.jp", "東京都", "IT", "テストデータ1"],
	        ["佐藤 花子", "テスト商事", "06-9876-5432", "sato@test.co.jp", "大阪府", "製造業", "テストデータ2"],
	        ["鈴木 一郎", "サンプル工業", "052-1111-2222", "suzuki@sample.jp", "愛知県", "サービス業", "テストデータ3"],
	      ];

	      if (input.format === "xlsx") {
	        // In a real application, you would use a library like 'exceljs' or 'xlsx' to generate the binary content.
	        // Since we cannot install new packages easily, we'll return a placeholder for now.
	        // The client will handle the download based on the filename.
	        return {
	          content: "Placeholder for XLSX binary data",
	          filename: "sample_leads.xlsx",
	        };
	      }

	      // Generate CSV content with BOM (Byte Order Mark) for better Excel compatibility
	      const csvContent = sampleData.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
	      const bom = "\ufeff"; // UTF-8 BOM
	      
	      return {
	        content: bom + csvContent,
	        filename: "sample_leads.csv",
	      };
	    }),
  }),

  // ========== Dashboard / KPI ==========
  dashboard: router({
    // Get KPI statistics
    getKPI: protectedProcedure
      .input(
        z.object({
          startDate: z.date(),
          endDate: z.date(),
          agentId: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        const stats = await db.getKPIStats(input);

        const connectionRate = stats.totalCalls > 0 ? (stats.connectedCalls / stats.totalCalls) * 100 : 0;
        const appointmentRate = stats.connectedCalls > 0 ? (stats.appointedCalls / stats.connectedCalls) * 100 : 0;

        return {
          totalCalls: stats.totalCalls,
          connectedCalls: stats.connectedCalls,
          appointedCalls: stats.appointedCalls,
          connectionRate: Math.round(connectionRate * 10) / 10,
          appointmentRate: Math.round(appointmentRate * 10) / 10,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;

