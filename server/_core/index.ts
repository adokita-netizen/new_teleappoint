import "dotenv/config";
import express, { type Application } from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
// 本番は静的配信だけを静的 import（Vite開発用は動的 import）
import { serveStatic } from "./vite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./sdk";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * ローカル開発時のみ起動（Vite を動的 import）
 */
async function startLocalServer() {
  const app: Application = express();
  const server = createServer(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // セッションから user を解決する軽量ミドルウェア
  app.use(async (req, _res, next) => {
    try {
      const user = await sdk.authenticateRequest(req);
      (req as any).user = user
        ? { id: (user as any).id, role: (user as any).role || "viewer" }
        : undefined;
    } catch {
      (req as any).user = undefined;
    }
    next();
  });

  // 認証状態の確認
  app.get("/api/auth/me", (req, res) => {
    res.json((req as any).user ?? null);
  });

  // ログアウト（Cookie削除）
  app.get("/api/auth/logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req as any);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.status(200).json({ success: true });
  });

  // ローカルログイン（メール/パスワード）
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: "email and password are required" });
      const user = await (await import("../db")).getUserByEmail(email);
      if (!user) return res.status(401).json({ error: "Invalid credentials" });
      const ok = (user as any).passwordHash === `plain:${password}`; // 実運用はハッシュ比較
      if (!ok) return res.status(401).json({ error: "Invalid credentials" });
      const sessionToken = await sdk.createSessionToken((user as any).openId, { name: (user as any).name || "" });
      const cookieOptions = getSessionCookieOptions(req as any);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: 1000 * 60 * 60 * 24 * 365 });
      return res.status(200).json({ success: true });
    } catch (e) {
      console.error("/api/auth/login error", e);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  // 未ログインは /login へ（API と静的資産は除外）
  app.use((req, res, next) => {
    const path = req.path;
    if (
      path.startsWith("/api") ||
      path.startsWith("/login") ||
      path.startsWith("/api/oauth") ||
      /\.(js|css|png|jpg|jpeg|gif|svg|ico|txt|map)$/i.test(path)
    ) {
      return next();
    }
    if (!(req as any).user) {
      return res.redirect(302, "/login");
    }
    next();
  });

  registerOAuthRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

/** Vercel Serverless 入口（本番では Vite に触れない） */
const serverlessApp: Application = express();
serverlessApp.use(express.json({ limit: "50mb" }));
serverlessApp.use(express.urlencoded({ limit: "50mb", extended: true }));

// セッション解決（Serverless）
serverlessApp.use(async (req, _res, next) => {
  try {
    const user = await sdk.authenticateRequest(req as any);
    (req as any).user = user
      ? { id: (user as any).id, role: (user as any).role || "viewer" }
      : undefined;
  } catch {
    (req as any).user = undefined;
  }
  next();
});

serverlessApp.get("/api/auth/me", (req, res) => {
  res.json((req as any).user ?? null);
});

serverlessApp.get("/api/auth/logout", (req, res) => {
  const cookieOptions = getSessionCookieOptions(req as any);
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
  res.status(200).json({ success: true });
});

serverlessApp.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password are required" });
    const user = await (await import("../db")).getUserByEmail(email);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = (user as any).passwordHash === `plain:${password}`;
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const sessionToken = await sdk.createSessionToken((user as any).openId, { name: (user as any).name || "" });
    const cookieOptions = getSessionCookieOptions(req as any);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: 1000 * 60 * 60 * 24 * 365 });
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error("/api/auth/login error", e);
    return res.status(500).json({ error: "Login failed" });
  }
});

// 未ログインは /login へ（API と静的資産は除外）
serverlessApp.use((req, res, next) => {
  const path = (req as any).path as string;
  if (
    path.startsWith("/api") ||
    path.startsWith("/login") ||
    path.startsWith("/api/oauth") ||
    /\.(js|css|png|jpg|jpeg|gif|svg|ico|txt|map)$/i.test(path)
  ) {
    return next();
  }
  if (!(req as any).user) {
    return (res as any).redirect(302, "/login");
  }
  next();
});

registerOAuthRoutes(serverlessApp);

serverlessApp.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// 本番/開発を問わず、サーバレス側でも SPA を返せるようにしておく
// （Vercel の静的配信が優先される構成でも、誤って本関数に到達した場合のフォールバックになる）
serveStatic(serverlessApp);

export default function handler(req: VercelRequest, res: VercelResponse) {
  return (serverlessApp as any)(req, res);
}

// ローカル開発用（直接 node 実行時のみ）
if (process.env.VERCEL !== "1" && process.env.NODE_ENV !== "production") {
  startLocalServer().catch(console.error);
}
