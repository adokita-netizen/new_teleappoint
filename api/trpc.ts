import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";

// Vercel Serverless Functionのエントリーポイント
const app = express();

// trpcルーターをExpressミドルウェアとしてラップ
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: createContext,
  })
);

// Vercelが認識するハンドラとしてExpressアプリをエクスポート
export default app;
