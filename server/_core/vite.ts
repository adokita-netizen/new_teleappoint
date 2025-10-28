import express, {
  type Application,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

/**
 * 開発時: Vite のミドルウェアを Express に組み込む
 */
export async function setupVite(app: Application, server: Server) {
  const serverOptions = {
    middlewareMode: true as const,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares as any);

  app.use("*", async (req: Request, res: Response, next: NextFunction) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        // 実行時は src 側（ts）を想定：dev 専用
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // index.html を都度読み込み（HMR のため）
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );

      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

/**
 * 本番: 事前ビルド済みの静的ファイルを配信
 * - サーバは dist/server/index.mjs として配置
 * - 静的は dist/public 配下に配置
 *   ⇒ 実行時の import.meta.dirname は dist/server を指すため、../public を参照
 */
export function serveStatic(app: Application) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "..", "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}. Did you run "vite build"?`
    );
  }

  app.use(express.static(distPath));

  // SPA: 既存ファイルが無ければ index.html を返す
  app.use("*", (_req: Request, res: Response) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
