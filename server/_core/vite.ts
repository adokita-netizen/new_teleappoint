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

/**
 * 開発時だけ Vite を動的 import して組み込む
 * これにより本番バンドルから vite / vite.config を完全に排除できる
 */
export async function setupVite(app: Application, server: Server) {
  const { createServer: createViteServer } = await import("vite");
  // vite.config は default / named どちらでも拾えるように
  const viteConfigMod: any = await import("../../vite.config");
  const viteConfig = viteConfigMod.default ?? viteConfigMod;

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
        // dev 時は src 側を参照
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
      // @ts-expect-error: vite 型は dev 専用
      vite.ssrFixStacktrace(e);
      next(e as Error);
    }
  });
}

/**
 * 本番は dist/public 配下のみを配信（vite には一切触れない）
 * dist/server/index.mjs から実行されるため、public は 1 つ上のディレクトリ
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
