import "dotenv/config";
import express, { type Application } from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import type { VercelRequest, VercelResponse } from "@vercel/node";

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
 * ローカル開発では express サーバを起動
 * Vercel 実行時（Serverless）は export default handler が使われる
 */
async function startLocalServer() {
  const app: Application = express();
  const server = createServer(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
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

/** Vercel の Serverless 入口（ここだけ Vercel 型を使う） */
const serverlessApp: Application = express();
serverlessApp.use(express.json({ limit: "50mb" }));
serverlessApp.use(express.urlencoded({ limit: "50mb", extended: true }));
registerOAuthRoutes(serverlessApp);
serverlessApp.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);
// Serverless 環境でも静的配信を有効化
serveStatic(serverlessApp);

export default function handler(req: VercelRequest, res: VercelResponse) {
  return (serverlessApp as any)(req, res);
}

// ローカル開発用（node dist/server/index.mjs を直接実行したとき）
if (process.env.VERCEL !== "1" && process.env.NODE_ENV !== "production") {
  // 開発向けのみ起動（本番は Vercel handler が使われる）
  startLocalServer().catch(console.error);
}
