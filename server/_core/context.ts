import type express from "express";

export type UserLike = {
  id: number;
  role: "admin" | "manager" | "agent" | "viewer";
};

export type Context = {
  req: express.Request;
  res: express.Response;
  user: UserLike;
};

/** tRPC 用コンテキスト（ここで drizzle/schema を import しない） */
export async function createContext({
  req,
  res,
}: {
  req: express.Request;
  res: express.Response;
}): Promise<Context> {
  const user =
    (req as any).user ??
    ({
      id: 0,
      role: "viewer",
    } as UserLike);
  return { req, res, user };
}
