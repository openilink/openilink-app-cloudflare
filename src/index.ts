/**
 * 主入口文件 - 启动 HTTP 服务器
 *
 * per-installation 凭证隔离：
 * 不在启动时创建全局 Cloudflare client，而是在处理 command 时根据
 * installation 的 config（用户填写的 API Token）动态创建，
 * 环境变量作为默认值兜底。
 */
import http from "node:http";
import Cloudflare from "cloudflare";
import { loadConfig } from "./config.js";
import { Store } from "./store.js";
import { HubClient } from "./hub/client.js";
import { Router } from "./router.js";
import { handleWebhook } from "./hub/webhook.js";
import { handleOAuthSetup, handleOAuthRedirect } from "./hub/oauth.js";
import { getManifest } from "./hub/manifest.js";
import { collectAllTools, setCurrentClient } from "./tools/index.js";
import type { HubEvent, Installation } from "./hub/types.js";

/** 解析请求 URL 的路径和方法 */
function parseRequest(req: http.IncomingMessage): { method: string; pathname: string } {
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  return { method, pathname: url.pathname };
}

// ─── per-installation Cloudflare client 缓存 ───

/** 以 apiToken 为 key 缓存 Cloudflare client，避免重复创建 */
const clientCache = new Map<string, Cloudflare>();

/**
 * 根据 apiToken 获取或缓存 Cloudflare client
 * @param apiToken Cloudflare API Token
 */
function getOrCreateClient(apiToken: string): Cloudflare {
  let client = clientCache.get(apiToken);
  if (!client) {
    client = new Cloudflare({ apiToken });
    clientCache.set(apiToken, client);
  }
  return client;
}

async function main(): Promise<void> {
  // 1. 加载配置
  const config = loadConfig();
  console.log("[main] 配置加载完成");

  // 2. 初始化存储
  const store = new Store(config.dbPath);
  console.log("[main] 数据库初始化完成");

  // 3. 收集所有 tools（不再需要传入 client，handler 内部通过 getCurrentClient() 获取）
  const { definitions, handlers } = collectAllTools();
  console.log(`[main] 已注册 ${definitions.length} 个工具`);

  // 4. 初始化路由器
  const router = new Router(handlers);

  /** 获取 HubClient 实例（用于异步回复等场景） */
  function getHubClient(installation: Installation): HubClient {
    return new HubClient(installation.hubUrl, installation.appToken);
  }

  /**
   * 处理 command 事件（同步/异步超时由 webhook 层控制）
   * 从本地加密存储读取 per-installation 配置，动态创建对应的 Cloudflare client
   * 返回工具执行结果文本，null 表示无需回复
   */
  async function onCommand(event: HubEvent, installation: Installation): Promise<string | null> {
    if (!event.event) return null;

    // 从加密存储读取 per-installation 配置，替代内存中的 installation.config
    const localConfig = store.getDecryptedConfig(installation.id);
    const apiToken = localConfig.cloudflare_api_token || config.cloudflareApiToken;
    const client = getOrCreateClient(apiToken);
    setCurrentClient(client);

    const hubClient = getHubClient(installation);
    const result = await router.handleCommand(event, installation, hubClient);
    return result;
  }

  // 5. 创建 HTTP 服务器
  const server = http.createServer(async (req, res) => {
    const { method, pathname } = parseRequest(req);

    try {
      // POST /hub/webhook - Hub 事件推送
      if (method === "POST" && pathname === "/hub/webhook") {
        await handleWebhook(req, res, { store, onCommand, getHubClient });
        return;
      }

      // GET /oauth/setup - OAuth 安装流程
      if (method === "GET" && pathname === "/oauth/setup") {
        handleOAuthSetup(req, res, config);
        return;
      }

      // GET /oauth/redirect - OAuth 回调
      if (method === "GET" && pathname === "/oauth/redirect") {
        await handleOAuthRedirect(req, res, config, store, definitions);
        return;
      }

      // POST /oauth/redirect - 模式 2: Hub 直接安装通知
      if (method === "POST" && pathname === "/oauth/redirect") {
        const body = await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", () => resolve(Buffer.concat(chunks)));
          req.on("error", reject);
        });
        const data = JSON.parse(body.toString());

        // 解析 Hub 传来的用户配置
        let installConfig: Record<string, string> = {};
        if (data.config && typeof data.config === "object") {
          installConfig = data.config;
        }

        store.saveInstallation({
          id: data.installation_id,
          hubUrl: data.hub_url || config.hubUrl,
          appId: "",
          botId: data.bot_id || "",
          appToken: data.app_token,
          webhookSecret: data.webhook_secret,
          createdAt: new Date().toISOString(),
          config: installConfig,
        });
        console.log("[oauth] 模式2安装成功, installation_id:", data.installation_id);
        // 安装后从 Hub 拉取用户配置并加密存储
        const mode2HubClient = new HubClient(data.hub_url || config.hubUrl, data.app_token);
        mode2HubClient.fetchConfig().then((userConfig) => {
          if (Object.keys(userConfig).length > 0) {
            store.saveEncryptedConfig(data.installation_id, userConfig);
            console.log("[oauth] 模式2用户配置已加密存储");
          }
        }).catch((err) => console.error("[oauth] 模式2拉取配置失败:", err));
        // 异步同步工具定义到 Hub
        mode2HubClient
          .syncTools(definitions)
          .catch((err) => console.error("[oauth] 模式2同步工具失败:", err));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ webhook_url: `${config.baseUrl}/hub/webhook` }));
        return;
      }

      // GET /manifest.json - App Manifest
      if (method === "GET" && pathname === "/manifest.json") {
        const manifest = getManifest(config, definitions);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(manifest, null, 2));
        return;
      }

      // GET /health - 健康检查
      if (method === "GET" && pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      // 404
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
    } catch (err) {
      console.error("[main] 请求处理异常:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Server Error" }));
      }
    }
  });

  // 6. 启动 HTTP 服务器
  const port = parseInt(config.port, 10);
  server.listen(port, () => {
    console.log(`[main] HTTP 服务器已启动，监听端口 ${port}`);
    console.log(`[main] Manifest: http://localhost:${port}/manifest.json`);
    console.log(`[main] Health: http://localhost:${port}/health`);

    // 启动时同步工具定义到所有已安装的 Hub 实例
    const installations = store.getAllInstallations();
    for (const inst of installations) {
      const hubClient = new HubClient(inst.hubUrl, inst.appToken);
      hubClient.syncTools(definitions).catch((err) => {
        console.error(`[main] 启动同步工具失败 (installation=${inst.id}):`, err);
      });
    }
    if (installations.length > 0) {
      console.log(`[main] 正在向 ${installations.length} 个安装实例同步工具定义`);
    }
  });

  // 7. 优雅关闭
  const shutdown = (signal: string) => {
    console.log(`\n[main] 收到 ${signal} 信号，开始优雅关闭...`);
    server.close(() => {
      console.log("[main] HTTP 服务器已关闭");
      store.close();
      console.log("[main] 数据库连接已关闭");
      process.exit(0);
    });

    // 超时强制退出
    setTimeout(() => {
      console.error("[main] 优雅关闭超时，强制退出");
      process.exit(1);
    }, 5000);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// 启动应用
main().catch((err) => {
  console.error("[main] 启动失败:", err);
  process.exit(1);
});
