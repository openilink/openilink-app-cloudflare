/**
 * OAuth PKCE 授权流程处理（含 setup 配置页面）
 *
 * 流程：
 * 1. GET  /oauth/setup → 显示配置表单 HTML（填写 Cloudflare API Token 和可选 Account ID）
 * 2. POST /oauth/setup → 提交表单，生成 PKCE 并重定向到 Hub 授权页
 * 3. GET  /oauth/redirect → Hub 回调，用 code + code_verifier 换取凭证并保存
 * 4. 安装成功后同步工具定义到 Hub
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { generatePKCE } from "../utils/crypto.js";
import type { Config } from "../config.js";
import type { Store } from "../store.js";
import type { OAuthExchangeResult, ToolDefinition } from "./types.js";
import { HubClient } from "./client.js";
import { readBody } from "./webhook.js";

/** PKCE 缓存条目（含用户填写的配置） */
interface PKCEEntry {
  verifier: string;
  /** Hub 服务地址（从查询参数传入） */
  hubUrl: string;
  /** 应用 ID */
  appId: string;
  /** 安装完成后跳转地址 */
  returnUrl: string;
  /** 用户在 setup 页面填写的凭证 */
  userConfig?: Record<string, string>;
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
 * 处理 OAuth 安装流程第一步：
 * GET  → 显示配置表单 HTML，让用户填写 Cloudflare 凭证
 * POST → 读取表单数据，生成 PKCE 并重定向到 Hub 授权页
 * 路由: GET/POST /oauth/setup
 */
export async function handleOAuthSetup(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const params = url.searchParams;

  const hub = params.get("hub") ?? config.hubUrl;
  const appId = params.get("app_id") ?? "";
  const botId = params.get("bot_id") ?? "";
  const state = params.get("state") ?? "";
  const returnUrl = params.get("return_url") ?? "";

  // POST 请求 — 用户提交了配置表单
  if (req.method === "POST") {
    const body = await readBody(req);
    const formData = new URLSearchParams(body.toString());
    const cfApiToken = formData.get("cloudflare_api_token") || "";
    const cfAccountId = formData.get("cloudflare_account_id") || "";

    if (!hub || !appId || !botId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "缺少必填参数: hub, app_id, bot_id" }));
      return;
    }

    // 清理过期缓存
    cleanExpired();

    // 生成 PKCE（base64url 编码）
    const { verifier, challenge } = generatePKCE();
    const localState = state || crypto.randomUUID();

    // 缓存 PKCE + 用户填的配置
    pkceCache.set(localState, {
      verifier,
      hubUrl: hub,
      appId,
      returnUrl,
      userConfig: { cloudflare_api_token: cfApiToken, cloudflare_account_id: cfAccountId },
      expiresAt: Date.now() + PKCE_TTL_MS,
    });

    // 构建 Hub 授权 URL: /api/apps/{appId}/oauth/authorize
    const redirectUri = `${config.baseUrl}/oauth/redirect`;
    const authUrl = new URL(`${hub}/api/apps/${appId}/oauth/authorize`);
    authUrl.searchParams.set("bot_id", botId);
    authUrl.searchParams.set("state", localState);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("code_challenge", challenge);
    if (returnUrl) {
      authUrl.searchParams.set("return_url", returnUrl);
    }

    // 重定向到 Hub 授权页
    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  // GET 请求 — 显示配置表单 HTML
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cloudflare — 配置</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: white; border-radius: 12px; padding: 32px; max-width: 420px; width: 100%; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .desc { color: #666; font-size: 14px; margin-bottom: 24px; }
    label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; color: #333; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; margin-bottom: 16px; }
    input:focus { outline: none; border-color: #3370ff; }
    .required::after { content: " *"; color: red; }
    button { width: 100%; padding: 12px; background: #3370ff; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; }
    button:hover { background: #2860e0; }
    .hint { font-size: 12px; color: #999; margin-top: -12px; margin-bottom: 16px; }
    a { color: #3370ff; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Cloudflare</h1>
    <p class="desc">请填写您的 Cloudflare 凭证，用于连接 Cloudflare API</p>
    <form method="POST" action="/oauth/setup?hub=${encodeURIComponent(hub)}&app_id=${encodeURIComponent(appId)}&bot_id=${encodeURIComponent(botId)}&state=${encodeURIComponent(state)}&return_url=${encodeURIComponent(returnUrl)}">
      <label class="required">Cloudflare API Token</label>
      <input name="cloudflare_api_token" type="password" placeholder="API Token" required />
      <p class="hint">在 <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank">Cloudflare Dashboard → API Tokens</a> 创建</p>

      <label>Account ID（可选）</label>
      <input name="cloudflare_account_id" placeholder="用于 Workers/R2 等 Account 级别操作" />
      <p class="hint">在 Dashboard 首页右侧可找到</p>

      <button type="submit">确认并安装</button>
    </form>
  </div>
</body>
</html>`;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
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

  const { verifier, hubUrl, appId, returnUrl, userConfig } = pkceEntry;

  try {
    // 向 Hub 交换凭证: /api/apps/{appId}/oauth/exchange
    const exchangeUrl = `${hubUrl}/api/apps/${appId}/oauth/exchange`;
    const exchangeRes = await fetch(exchangeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
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
      hubUrl,
      appId,
      botId: result.bot_id,
      appToken: result.app_token,
      webhookSecret: result.webhook_secret,
      createdAt: new Date().toISOString(),
    });

    console.log("[oauth] 安装成功, installation_id:", result.installation_id);

    // 将用户在 setup 页面填写的配置加密存储到本地
    if (userConfig && Object.values(userConfig).some((v) => v)) {
      store.saveEncryptedConfig(result.installation_id, userConfig);
      console.log("[oauth] 用户配置已加密存储");
    }

    // 安装后从 Hub 拉取用户配置并加密存储到本地
    const hubClient = new HubClient(hubUrl, result.app_token);
    try {
      const remoteConfig = await hubClient.fetchConfig();
      if (Object.keys(remoteConfig).length > 0) {
        store.saveEncryptedConfig(result.installation_id, { ...userConfig, ...remoteConfig });
        console.log("[oauth] 用户配置已加密存储到本地");
      }
    } catch (err) {
      console.error("[oauth] 拉取用户配置失败:", err);
    }

    // OAuth 成功后同步工具定义到 Hub
    if (tools && tools.length > 0) {
      hubClient.syncTools(tools).catch((err) => {
        console.error("[oauth] 同步工具定义失败:", err);
      });
    }

    // 重定向到 returnUrl（如果有）
    if (returnUrl) {
      res.writeHead(302, { Location: returnUrl });
      res.end();
    } else {
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
    }
  } catch (err) {
    console.error("[oauth] 凭证交换异常:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "凭证交换过程发生异常" }));
  }
}
