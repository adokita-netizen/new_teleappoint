import type { Request, Response } from "express";

export type UserLike = {
  id: number;
  role: "admin" | "manager" | "agent" | "viewer";
};

export type Context = {
  req: Request;
  res: Response;
  user: UserLike;
};

/**
 * tRPC 用コンテキスト
 * - ここでは DB スキーマを import しない（サイズ増＆パス崩れ防止）
 * - 認証は最小限のダミー（あとで本実装に差し替え可）
 */
export async function createContext({
  req,
  res,
}: {
  req: Request;
  res: Response;
}): Promise<Context> {
  // 本実装があるなら Cookie / Header から復元する
  const user =
    (req as any).user ??
    ({
      id: 0,
      role: "viewer",
    } as UserLike);

  return { req, res, user };
}
