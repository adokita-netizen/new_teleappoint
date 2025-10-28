// Minimal stub schema for build-time type resolution.
// Replace with actual Drizzle schema when available.

export type User = {
	id: number;
	openId: string;
	name: string | null;
	email: string | null;
	loginMethod: string | null;
	role: "admin" | "manager" | "agent" | "viewer";
  passwordHash?: string | null;
	createdAt?: Date;
	updatedAt?: Date;
};

// Insert types used by server/db.ts
export type InsertUser = Partial<User> & { openId: string; lastSignedIn?: Date };
export type InsertLead = Record<string, unknown>;
export type InsertCallLog = Record<string, unknown>;
export type InsertAppointment = Record<string, unknown>;
export type InsertList = Record<string, unknown>;
export type InsertCampaign = Record<string, unknown>;
export type InsertAssignment = Record<string, unknown>;

// Table placeholders (typed as any to keep flexibility until real schema is added)
export const users: any = {};
export const leads: any = {};
export const callLogs: any = {};
export const appointments: any = {};
export const lists: any = {};
export const campaigns: any = {};
export const assignments: any = {};
export const activityLogs: any = {};
export const operatorMetrics: any = {};

// Projects-related placeholders
export const projects: any = {};
// project fields expected to include: id, name, description, status, createdAt, createdBy, calendarUrl, talkScript
export const projectMembers: any = {};
export const listsUpdated: any = {};
export const campaignsUpdated: any = {};

// Invitations placeholder
export type Invite = {
  id: number;
  email: string;
  token: string;
  role: "manager" | "agent" | "viewer";
  expiresAt: Date;
  acceptedAt?: Date | null;
  createdAt?: Date;
};
export const invitations: any = {};


