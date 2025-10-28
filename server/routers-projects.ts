import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import * as dbProjects from "./db-projects";

// Role-based access control helpers
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new Error("Admin access required");
  }
  return next({ ctx });
});

const projectManagerProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  // Check if user is a project manager or admin
  if (ctx.user.role !== "admin" && ctx.user.role !== "manager") {
    throw new Error("Project manager access required");
  }
  return next({ ctx });
});

// ========== Projects Management ==========
export const projectsRouter = router({
  // Create a new project
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await dbProjects.createProject({
        name: input.name,
        description: input.description,
        createdBy: ctx.user.id,
      });
      return { success: true, projectId: result.insertId };
    }),

  // Get all projects (admin only)
  getAll: adminProcedure.query(async () => {
    return await dbProjects.getAllProjects();
  }),

  // Get projects for current user
  getMyProjects: protectedProcedure.query(async ({ ctx }) => {
    const userProjects = await dbProjects.getUserProjects(ctx.user.id);
    return userProjects;
  }),

  // Get project details
  getById: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      const project = await dbProjects.getProjectById(input.projectId);
      if (!project) {
        throw new Error("Project not found");
      }

      // Check if user has access to this project
      const members = await dbProjects.getProjectMembers(input.projectId);
      const isMember = members.some((m) => m.userId === ctx.user.id);
      const isAdmin = ctx.user.role === "admin";

      if (!isMember && !isAdmin) {
        throw new Error("Access denied");
      }

      return project;
    }),

  // Update project
  update: projectManagerProcedure
    .input(
      z.object({
        projectId: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["active", "archived", "inactive"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const project = await dbProjects.getProjectById(input.projectId);
      if (!project) {
        throw new Error("Project not found");
      }

      // Check if user is the creator or admin
      if (project.createdBy !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }

      await dbProjects.updateProject(input.projectId, {
        name: input.name,
        description: input.description,
        status: input.status,
      });

      return { success: true };
    }),

  // Delete project
  delete: adminProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ input }) => {
      await dbProjects.deleteProject(input.projectId);
      return { success: true };
    }),
});

// ========== Project Members Management ==========
export const projectMembersRouter = router({
  // Add member to project
  add: projectManagerProcedure
    .input(
      z.object({
        projectId: z.number(),
        userId: z.number(),
        role: z.enum(["owner", "manager", "agent", "viewer"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const project = await dbProjects.getProjectById(input.projectId);
      if (!project) {
        throw new Error("Project not found");
      }

      // Check if user has permission to add members
      const members = await dbProjects.getProjectMembers(input.projectId);
      const userMember = members.find((m) => m.userId === ctx.user.id);

      if (!userMember && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }

      if (userMember && userMember.role !== "owner" && ctx.user.role !== "admin") {
        throw new Error("Only project owner can add members");
      }

      await dbProjects.addProjectMember({
        projectId: input.projectId,
        userId: input.userId,
        role: input.role,
        addedBy: ctx.user.id,
      });

      return { success: true };
    }),

  // Get project members
  getMembers: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      const project = await dbProjects.getProjectById(input.projectId);
      if (!project) {
        throw new Error("Project not found");
      }

      // Check if user has access
      const members = await dbProjects.getProjectMembers(input.projectId);
      const isMember = members.some((m) => m.userId === ctx.user.id);

      if (!isMember && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }

      return members;
    }),

  // Update member role
  updateRole: projectManagerProcedure
    .input(
      z.object({
        projectId: z.number(),
        userId: z.number(),
        role: z.enum(["owner", "manager", "agent", "viewer"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const members = await dbProjects.getProjectMembers(input.projectId);
      const userMember = members.find((m) => m.userId === ctx.user.id);

      if (!userMember && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }

      if (userMember && userMember.role !== "owner" && ctx.user.role !== "admin") {
        throw new Error("Only project owner can update members");
      }

      await dbProjects.updateProjectMember(input.projectId, input.userId, {
        role: input.role,
      });

      return { success: true };
    }),

  // Remove member from project
  remove: projectManagerProcedure
    .input(
      z.object({
        projectId: z.number(),
        userId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const members = await dbProjects.getProjectMembers(input.projectId);
      const userMember = members.find((m) => m.userId === ctx.user.id);

      if (!userMember && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }

      if (userMember && userMember.role !== "owner" && ctx.user.role !== "admin") {
        throw new Error("Only project owner can remove members");
      }

      await dbProjects.removeProjectMember(input.projectId, input.userId);

      return { success: true };
    }),
});

// ========== Project Lists Management ==========
export const projectListsRouter = router({
  // Create list in project
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const members = await dbProjects.getProjectMembers(input.projectId);
      const isMember = members.some((m) => m.userId === ctx.user.id);

      if (!isMember && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }

      const result = await dbProjects.createProjectList({
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        createdBy: ctx.user.id,
      });

      return { success: true, listId: result.insertId };
    }),

  // Get lists for project
  getByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      const members = await dbProjects.getProjectMembers(input.projectId);
      const isMember = members.some((m) => m.userId === ctx.user.id);

      if (!isMember && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }

      return await dbProjects.getProjectLists(input.projectId);
    }),
});

// ========== Project Campaigns Management ==========
export const projectCampaignsRouter = router({
  // Create campaign in project
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const members = await dbProjects.getProjectMembers(input.projectId);
      const isMember = members.some((m) => m.userId === ctx.user.id);

      if (!isMember && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }

      const result = await dbProjects.createProjectCampaign({
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        createdBy: ctx.user.id,
      });

      return { success: true, campaignId: result.insertId };
    }),

  // Get campaigns for project
  getByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      const members = await dbProjects.getProjectMembers(input.projectId);
      const isMember = members.some((m) => m.userId === ctx.user.id);

      if (!isMember && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }

      return await dbProjects.getProjectCampaigns(input.projectId);
    }),
});

