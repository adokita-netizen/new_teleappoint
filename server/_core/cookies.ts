import { type CookieOptions, type Request, type Response } from "express";

function isIpAddress(host: string) {
  // IPv4 / IPv6 の簡易判定
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

/** x-forwarded-proto 等を見て https か判定 */
function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some((p) => p.trim().toLowerCase() === "https");
}

/**
 * セッション Cookie の共通オプションを返す
 * - domain は環境により可変のため付与しない（必要なら呼び出し側で上書き）
 */
export function getSessionCookieOptions(req: Request): CookieOptions {
  // 必要であれば domain を計算して付ける場合の雛形（無効化中）
  // const hostname = req.hostname;
  // const shouldSetDomain =
  //   hostname &&
  //   hostname !== "127.0.0.1" &&
  //   hostname !== "::1" &&
  //   !isIpAddress(hostname);
  // const domain = shouldSetDomain && !hostname.startsWith(".")
  //   ? `.${hostname}`
  //   : shouldSetDomain
  //   ? hostname
  //   : undefined;

  const secure = isSecureRequest(req);

  const base: CookieOptions = {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax", // cross-site 必要時は none（https 必須）
    secure,
    // ...(domain ? { domain } : {}),
  };

  return base;
}

/** 明示的にクリアする補助関数（必要なら利用） */
export function clearSessionCookie(
  res: Response,
  name: string,
  base: CookieOptions
) {
  res.clearCookie(name, { ...base, maxAge: -1 });
}
