/**
 * OAuth PKCE 授权流程处理
 *
 * 流程：
 * 1. 用户访问 /oauth/setup?hub=xxx&app_id=xxx&bot_id=xxx&state=xxx
 *    → 生成 PKCE 码对，重定向到 Hub 授权页
 *    → 授权 URL: {hub}/api/apps/{appId}/oauth/authorize
 * 2. Hub 回调 /oauth/redirect?code=xxx&state=xxx
 *    → 用 code + code_verifier 换取 token
 *    → 交换 URL: {hub}/api/apps/{appId}/oauth/exchange
 * 3. 将安装信息持久化到 Store
 * 4. 安装成功后同步工具定义到 Hub
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { generatePKCE } from "../utils/crypto.js";
import type { Config } from "../config.js";
import type { Store } from "../store.js";
import type { OAuthExchangeResult, ToolDefinition } from "./types.js";
import { HubClient } from "./client.js";

/** PKCE 缓存条目 */
interface PKCEEntry {
  verifier: string;
  /** Hub 服务地址（从查询参数传入） */
  hubUrl: string;
  /** 应用 ID */
  appId: string;
  expiresAt: number;
}

/** PKCE 缓存，key 为 state，10 分钟过期 */
const pkceCache = new Map<string, PKCEEntry>();

/** 缓存过期时间：10 分钟 */
const PKCE_TTL_MS = 10 * 60 * 1000;

/** 清理过期的 PKCE 条目 */
function cleanExpired(): void {
  const now = Date.now();
  for (const [key, entry] of pkceCache) {
    if (entry.expiresAt < now) {
      pkceCache.delete(key);
    }
  }
}

/**
 * 处理 OAuth 安装流程第一步：生成 PKCE 并重定向到 Hub 授权页
 * 路由: GET /oauth/setup?hub=xxx&app_id=xxx&bot_id=xxx&state=xxx
 */
export function handleOAuthSetup(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const params = url.searchParams;

  const hub = params.get("hub") ?? config.hubUrl;
  const appId = params.get("app_id") ?? "";
  const botId = params.get("bot_id") ?? "";
  const state = params.get("state") ?? "";
  const returnUrl = params.get("return_url") ?? "";

  if (!hub || !appId || !botId || !state) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "缺少必填参数: hub, app_id, bot_id, state" }));
    return;
  }

  // 清理过期缓存
  cleanExpired();

  // 生成 PKCE（base64url 编码）
  const { verifier, challenge } = generatePKCE();
  pkceCache.set(state, {
    verifier,
    hubUrl: hub,
    appId,
    expiresAt: Date.now() + PKCE_TTL_MS,
  });

  // 构建 Hub 授权 URL: /api/apps/{appId}/oauth/authorize
  const redirectUri = `${config.baseUrl}/oauth/redirect`;
  const authUrl = new URL(`${hub}/api/apps/${appId}/oauth/authorize`);
  authUrl.searchParams.set("bot_id", botId);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("code_challenge", challenge);
  if (returnUrl) {
    authUrl.searchParams.set("return_url", returnUrl);
  }

  // 重定向到 Hub 授权页
  res.writeHead(302, { Location: authUrl.toString() });
  res.end();
}

/**
 * 处理 OAuth 安装流程第二步：用授权码 + code_verifier 换取凭证并保存
 * 路由: GET /oauth/redirect?code=xxx&state=xxx
 * 交换 URL: {hub}/api/apps/{appId}/oauth/exchange
 */
export async function handleOAuthRedirect(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
  store: Store,
  tools?: ToolDefinition[],
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const params = url.searchParams;

  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";

  if (!code || !state) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "缺少必填参数: code, state" }));
    return;
  }

  // 清理过期缓存
  cleanExpired();

  // 从缓存取出 PKCE verifier
  const pkceEntry = pkceCache.get(state);
  if (!pkceEntry) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "PKCE 状态无效或已过期" }));
    return;
  }
  pkceCache.delete(state);

  try {
    // 向 Hub 交换凭证: /api/apps/{appId}/oauth/exchange
    const exchangeUrl = `${pkceEntry.hubUrl}/api/apps/${pkceEntry.appId}/oauth/exchange`;
    const exchangeRes = await fetch(exchangeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: pkceEntry.verifier,
      }),
    });

    if (!exchangeRes.ok) {
      const errText = await exchangeRes.text();
      console.error("[oauth] 凭证交换失败:", exchangeRes.status, errText);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "凭证交换失败", detail: errText }));
      return;
    }

    const result = (await exchangeRes.json()) as OAuthExchangeResult;

    // 保存安装信息
    store.saveInstallation({
      id: result.installation_id,
      hubUrl: pkceEntry.hubUrl,
      appId: pkceEntry.appId,
      botId: result.bot_id,
      appToken: result.app_token,
      webhookSecret: result.webhook_secret,
      createdAt: new Date().toISOString(),
    });

    console.log("[oauth] 安装成功, installation_id:", result.installation_id);

    // OAuth 成功后同步工具定义到 Hub
    if (tools && tools.length > 0) {
      const hubClient = new HubClient(pkceEntry.hubUrl, result.app_token);
      hubClient.syncTools(tools).catch((err) => {
        console.error("[oauth] 同步工具定义失败:", err);
      });
    }

    // 返回成功页面
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>安装成功</title></head>
        <body>
          <h1>Cloudflare App 安装成功!</h1>
          <p>Installation ID: ${result.installation_id}</p>
          <p>你可以关闭此页面。</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("[oauth] 凭证交换异常:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "凭证交换过程发生异常" }));
  }
}
