import express, { type Application } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import type { Request, Response } from "express";

function getQueryParam(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return typeof v === "string" ? v : undefined;
}

export function registerOAuthRoutes(app: Application) {
  // OAuth 開始: 認可URLへリダイレクト
  app.get("/api/oauth/login", async (req: Request, res: Response) => {
    try {
      const origin = `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${origin}/api/oauth/callback`;
      const state = Buffer.from(redirectUri).toString("base64");
      const authorizeUrl = await sdk.getAuthorizeRedirectUrl(redirectUri, state);
      return res.redirect(302, authorizeUrl);
    } catch (error) {
      console.error("[OAuth] Login redirect failed", error);
      return res.status(500).json({ error: "OAuth login failed" });
    }
  });

  app.get("/api/oauth/callback", async (req: express.Request, res: express.Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      return res.status(400).json({ error: "code and state are required" });
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        return res.status(400).json({ error: "openId missing from user info" });
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      return res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      return res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
