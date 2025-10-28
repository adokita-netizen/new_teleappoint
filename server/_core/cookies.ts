import { type CookieOptions, type Request, type Response } from "express";

/** x-forwarded-proto 等を見て https か判定 */
function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const list = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return list.some((p) => p.trim().toLowerCase() === "https");
}

/** セッション Cookie の共通オプション（domain は付けない） */
export function getSessionCookieOptions(req: Request): CookieOptions {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure,
  };
}

/** 必要ならクリア用のヘルパ */
export function clearSessionCookie(res: Response, name: string, base: CookieOptions) {
  res.clearCookie(name, { ...base, maxAge: -1 });
}
