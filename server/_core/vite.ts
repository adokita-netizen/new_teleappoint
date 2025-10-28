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

/** devのみ Vite を動的 import（本番バンドルから除外） */
export async function setupVite(app: Application, server: Server) {
  const { createServer: createViteServer } = await import("vite");
  const cfgMod: any = await import("../../vite.config");
  const viteConfig = cfgMod.default ?? cfgMod;

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
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );

      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      // @ts-expect-error vite型はdev専用
      vite.ssrFixStacktrace(e);
      next(e as Error);
    }
  });
}

/** 本番：dist/public を静的配信（Serverless実行は dist/server 起点） */
export function serveStatic(app: Application) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "..", "public"); // dist/server → dist/public

  if (!fs.existsSync(distPath)) {
    console.error(`Could not find the build directory: ${distPath}. Did you run "vite build"?`);
  }

  app.use(express.static(distPath));

  app.use("*", (_req: Request, res: Response) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
