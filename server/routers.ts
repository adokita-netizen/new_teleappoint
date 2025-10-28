import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import type { Request, Response } from "express";
import { projectsRouter, projectMembersRouter, projectListsRouter, projectCampaignsRouter } from "./routers-projects";

// RBAC
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
  projects: projectsRouter,
  projectMembers: projectMembersRouter,
  projectLists: projectListsRouter,
  projectCampaigns: projectCampaignsRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req as Request);
      // tRPC の疎な型に合わせ、明示的に Express へキャスト
      (ctx.res as Response).clearCookie(COOKIE_NAME, {
        ...cookieOptions,
        maxAge: -1,
      });
      return { success: true } as const;
    }),
    // 管理者が招待を作成
    invite: protectedProcedure
      .input(z.object({ email: z.string().email(), role: z.enum(["manager", "agent", "viewer"]) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user?.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7日
        await db.createInvitation(input.email, token, input.role, expiresAt);
        return { success: true, token } as const;
      }),
    // 招待を検証
    verifyInvite: publicProcedure
      .input(z.object({ token: z.string().min(8) }))
      .query(async ({ input }) => {
        const inv = await db.getInvitationByToken(input.token);
        if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
        if (new Date(inv.expiresAt) < new Date()) throw new TRPCError({ code: "BAD_REQUEST", message: "Invitation expired" });
        if (inv.acceptedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Invitation already used" });
        return { email: inv.email, role: inv.role } as const;
      }),
    // 招待でユーザーを作成（初回パスワード設定）
    acceptInvite: publicProcedure
      .input(z.object({ token: z.string().min(8), name: z.string().min(1), password: z.string().min(4) }))
      .mutation(async ({ input }) => {
        const inv = await db.getInvitationByToken(input.token);
        if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
        if (new Date(inv.expiresAt) < new Date()) throw new TRPCError({ code: "BAD_REQUEST", message: "Invitation expired" });
        if (inv.acceptedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Invitation already used" });

        // openId はメールをベースにローカルID化（簡易）
        const openId = `local:${inv.email}`;
        const passwordHash = `plain:${input.password}`; // 実運用はハッシュ化
        await db.upsertUser({ openId, name: input.name, email: inv.email, role: inv.role, loginMethod: "local", lastSignedIn: new Date() } as any);
        await db.updateUserRole((await db.getUserByOpenId(openId) as any)?.id, inv.role);
        await db.updateUser((await db.getUserByOpenId(openId) as any)?.id, { passwordHash } as any);
        await db.markInvitationAccepted(inv.id);
        return { success: true } as const;
      }),
  }),

  // ===== Leads =====
  leads: router({
    create: managerProcedure
      .input(
        z.object({
          name: z.string().min(1, "必須"),
          company: z.string().optional(),
          phone: z
            .string()
            .min(7)
            .max(20)
            .regex(/^[0-9+\-()\s]+$/, "電話番号の形式" )
            .optional(),
          email: z.string().email().optional(),
          prefecture: z.string().optional(),
          industry: z.string().optional(),
          memo: z.string().optional(),
          listId: z.number().optional(),
          campaignId: z.number().optional(),
        })
        .refine((v) => !!v.phone || !!v.email, {
          message: "電話またはメールのいずれかは必須",
          path: ["phone"],
        })
      )
      .mutation(async ({ input }) => {
        await db.createLead({
          ...input,
          status: "unreached",
        } as any);
        return { success: true } as const;
      }),
    getNext: agentProcedure.query(async ({ ctx }) => {
      const lead = await db.getNextLead(ctx.user.id);
      return lead ?? null;
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => db.getLeadById(input.id)),

    list: protectedProcedure
      .input(
        z.object({
          status: z
            .enum([
              "unreached",
              "connected",
              "no_answer",
              "callback_requested",
              "retry_waiting",
              "ng",
              "considering",
              "appointed",
              "lost",
            ])
            .optional(),
          ownerId: z.number().optional(),
          listId: z.number().optional(),
          campaignId: z.number().optional(),
        })
      )
      .query(async ({ input }) => db.getLeadsByFilters(input)),

    myLeads: agentProcedure.query(async ({ ctx }) =>
      db.getLeadsByOwnerId(ctx.user.id)
    ),

    update: agentProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          company: z.string().optional(),
          phone: z
            .string()
            .min(7)
            .max(20)
            .regex(/^[0-9+\-()\s]+$/)
            .optional(),
          email: z.string().email().optional(),
          prefecture: z.string().optional(),
          industry: z.string().optional(),
          memo: z.string().optional(),
          status: z
            .enum([
              "unreached",
              "connected",
              "no_answer",
              "callback_requested",
              "retry_waiting",
              "ng",
              "considering",
              "appointed",
              "lost",
            ])
            .optional(),
          nextActionAt: z.date().optional(),
          ownerId: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateLead(id, data);
        return { success: true };
      }),

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

  // ===== Call Logs =====
  callLogs: router({
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
        await db.createCallLog({
          leadId: input.leadId,
          agentId: ctx.user.id,
          result: input.result,
          memo: input.memo,
          nextActionAt: input.nextActionAt,
        });
        await db.updateLead(input.leadId, {
          status: input.result,
          nextActionAt: input.nextActionAt,
        });
        return { success: true };
      }),

    getByLead: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => db.getCallLogsByLeadId(input.leadId)),

    getByAgent: protectedProcedure
      .input(z.object({ agentId: z.number() }))
      .query(async ({ input }) => db.getCallLogsByAgentId(input.agentId)),
  }),

  // ===== Appointments =====
  appointments: router({
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
        await db.createAppointment({ ...input, status: "scheduled" });
        return { success: true };
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => db.getAppointmentById(input.id)),

    getByOwner: protectedProcedure
      .input(z.object({ ownerUserId: z.number() }))
      .query(async ({ input }) => db.getAppointmentsByOwner(input.ownerUserId)),

    update: agentProcedure
      .input(
        z.object({
          id: z.number(),
          status: z
            .enum(["scheduled", "confirmed", "cancelled", "completed"])
            .optional(),
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

    delete: agentProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteAppointment(input.id);
        return { success: true };
      }),
  }),

  // ===== Lists =====
  lists: router({
    create: managerProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await db.createList({
          ...input,
          createdBy: ctx.user.id,
          totalCount: 0,
        });
        return { success: true };
      }),

    getAll: protectedProcedure.query(async () => db.getAllLists()),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => db.getListById(input.id)),
  }),

  // ===== Campaigns =====
  campaigns: router({
    create: managerProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await db.createCampaign({ ...input, createdBy: ctx.user.id });
        return { success: true };
      }),

    getAll: protectedProcedure.query(async () => db.getAllCampaigns()),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => db.getCampaignById(input.id)),
  }),

  // ===== Users =====
  users: router({
    getAll: adminProcedure.query(async () => db.getAllUsers()),
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

  // ===== CSV =====
  csv: router({
    exportLeads: protectedProcedure
      .input(
        z.object({
          status: z
            .enum([
              "unreached",
              "connected",
              "no_answer",
              "callback_requested",
              "retry_waiting",
              "ng",
              "considering",
              "appointed",
              "lost",
            ])
            .optional(),
          ownerId: z.number().optional(),
          listId: z.number().optional(),
          campaignId: z.number().optional(),
        })
      )
      .query(async ({ input }) => db.getLeadsByFilters(input)),

    getSampleCSV: publicProcedure
      .input(z.object({ format: z.enum(["csv", "xlsx"]) }))
      .query(({ input }) => {
        const sampleData = [
          ["氏名", "会社名", "電話番号", "メールアドレス", "都道府県", "業種", "メモ"],
          ["山田 太郎", "株式会社サンプル", "03-1234-5678", "yamada@sample.co.jp", "東京都", "IT", "テストデータ1"],
          ["佐藤 花子", "テスト商事", "06-9876-5432", "sato@test.co.jp", "大阪府", "製造業", "テストデータ2"],
          ["鈴木 一郎", "サンプル工業", "052-1111-2222", "suzuki@sample.jp", "愛知県", "サービス業", "テストデータ3"],
        ];

        if (input.format === "xlsx") {
          return {
            content: "Placeholder for XLSX binary data",
            filename: "sample_leads.xlsx",
          };
        }

        const csvContent = sampleData
          .map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
          .join("\n");
        const bom = "\ufeff";

        return { content: bom + csvContent, filename: "sample_leads.csv" };
      }),
  }),

  // ===== Dashboard / KPI =====
  dashboard: router({
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
        const connectionRate =
          stats.totalCalls > 0
            ? (stats.connectedCalls / stats.totalCalls) * 100
            : 0;
        const appointmentRate =
          stats.connectedCalls > 0
            ? (stats.appointedCalls / stats.connectedCalls) * 100
            : 0;

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
