// @ts-nocheck
import type { CookieOptions } from "express";
import type express from "express";

/** x-forwarded-proto 等を見て https か判定 */
function isSecureRequest(req: express.Request) {
  const proto = (req as any).protocol;
  if (proto === "https") return true;
  const forwardedProto = (req as any).headers?.["x-forwarded-proto"] as string | string[] | undefined;
  if (!forwardedProto) return false;
  const list = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return list.some((p) => p.trim().toLowerCase() === "https");
}

/** セッション Cookie の共通オプション（domain は付けない） */
export function getSessionCookieOptions(req: express.Request): CookieOptions {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure,
  };
}

/** 必要ならクリア用のヘルパ */
export function clearSessionCookie(res: express.Response, name: string, base: CookieOptions) {
  (res as any).clearCookie(name, { ...base, maxAge: -1 });
}
