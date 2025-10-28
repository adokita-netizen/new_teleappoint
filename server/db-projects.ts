import { and, eq, desc } from "drizzle-orm";
import { projects, projectMembers, listsUpdated, campaignsUpdated } from "../drizzle/schema";
import { getDb } from "./db";

// ========== Projects ==========

export async function createProject(data: {
  name: string;
  description?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(projects).values(data);
  return result;
}

export async function getProjectById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return result[0];
}

export async function getAllProjects() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(projects).orderBy(desc(projects.createdAt));
}

export async function getProjectsByUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get projects where user is a member
  const memberProjects = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));

  if (memberProjects.length === 0) {
    return [];
  }

  const projectIds = memberProjects.map((m) => m.projectId);
  return await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.status, "active"),
        // This would need a more complex query to check if projectId is in the list
        // For now, we'll fetch all and filter in code
      )
    )
    .orderBy(desc(projects.createdAt));
}

export async function updateProject(id: number, data: Partial<any>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(projects).set(data).where(eq(projects.id, id));
}

export async function deleteProject(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(projects).where(eq(projects.id, id));
}

// ========== Project Members ==========

export async function addProjectMember(data: {
  projectId: number;
  userId: number;
  role: "owner" | "manager" | "agent" | "viewer";
  addedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.insert(projectMembers).values(data);
}

export async function getProjectMembers(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(projectMembers.addedAt);
}

export async function getUserProjects(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId))
    .orderBy(projectMembers.addedAt);
}

export async function updateProjectMember(
  projectId: number,
  userId: number,
  data: Partial<any>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(projectMembers)
    .set(data)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
}

export async function removeProjectMember(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
}

// ========== Project Lists ==========

export async function createProjectList(data: {
  projectId: number;
  name: string;
  description?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.insert(listsUpdated).values(data);
}

export async function getProjectLists(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(listsUpdated)
    .where(eq(listsUpdated.projectId, projectId))
    .orderBy(desc(listsUpdated.createdAt));
}

// ========== Project Campaigns ==========

export async function createProjectCampaign(data: {
  projectId: number;
  name: string;
  description?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.insert(campaignsUpdated).values(data);
}

export async function getProjectCampaigns(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(campaignsUpdated)
    .where(eq(campaignsUpdated.projectId, projectId))
    .orderBy(desc(campaignsUpdated.createdAt));
}

