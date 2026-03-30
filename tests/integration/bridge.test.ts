/**
 * Cloudflare App 集成测试
 *
 * 测试 Hub <-> App 的完整通信链路：
 * 1. Mock Hub Server 模拟 OpeniLink Hub
 * 2. 创建轻量 App HTTP 服务器（仅含 webhook handler + router）
 * 3. 使用内存 SQLite 存储 + Mock Cloudflare 客户端
 * 4. 验证命令路由和工具执行
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import { Store } from "../../src/store.js";
import { handleWebhook } from "../../src/hub/webhook.js";
import { HubClient } from "../../src/hub/client.js";
import { Router } from "../../src/router.js";
import { collectAllTools } from "../../src/tools/index.js";
import {
  startMockHub,
  injectCommand,
  MOCK_HUB_URL,
  MOCK_WEBHOOK_SECRET,
  MOCK_APP_TOKEN,
  MOCK_INSTALLATION_ID,
  MOCK_BOT_ID,
  APP_PORT,
} from "./setup.js";

// ─── Mock Cloudflare 客户端 ───

function createMockCloudflare() {
  return {
    zones: {
      list: vi.fn().mockResolvedValue({
        result: [
          {
            id: "zone-001",
            name: "example.com",
            status: "active",
            plan: { name: "Free" },
          },
        ],
      }),
      get: vi.fn().mockResolvedValue({
        id: "zone-001",
        name: "example.com",
        status: "active",
        name_servers: ["ns1.cloudflare.com", "ns2.cloudflare.com"],
        meta: { page_rule_quota: 3, phishing_detected: false },
      }),
      settings: {
        list: vi.fn().mockResolvedValue({
          result: [
            { id: "ssl", value: "full" },
            { id: "always_use_https", value: "on" },
            { id: "min_tls_version", value: "1.2" },
            { id: "security_level", value: "medium" },
            { id: "browser_cache_ttl", value: 14400 },
          ],
        }),
        get: vi.fn().mockImplementation((setting: string) => {
          const settings: Record<string, any> = {
            ssl: { value: "full" },
            security_level: { value: "medium" },
          };
          return Promise.resolve(settings[setting] ?? { value: "unknown" });
        }),
      },
    },
    dns: {
      records: {
        list: vi.fn().mockResolvedValue({
          result: [
            {
              id: "rec-001",
              type: "A",
              name: "www.example.com",
              content: "1.2.3.4",
              proxied: true,
              ttl: 1,
            },
          ],
        }),
        create: vi.fn().mockResolvedValue({
          id: "rec-new",
          type: "A",
          name: "api.example.com",
          content: "5.6.7.8",
        }),
        update: vi.fn().mockResolvedValue({
          id: "rec-001",
          type: "A",
          name: "www.example.com",
          content: "9.8.7.6",
        }),
        delete: vi.fn().mockResolvedValue({ id: "rec-001" }),
      },
    },
    workers: {
      scripts: {
        list: vi.fn().mockResolvedValue({
          result: [{ id: "my-worker", modified_on: "2024-06-01T00:00:00Z" }],
        }),
        get: vi.fn().mockResolvedValue({
          id: "my-worker",
          modified_on: "2024-06-01T00:00:00Z",
        }),
      },
      routes: {
        list: vi.fn().mockResolvedValue({
          result: [{ id: "route-001", pattern: "example.com/api/*", script: "my-worker" }],
        }),
      },
    },
    cache: {
      purge: vi.fn().mockResolvedValue({ id: "purge-001" }),
    },
    ssl: {
      certificatePacks: {
        list: vi.fn().mockResolvedValue({
          result: [
            { id: "cert-001", type: "universal", status: "active", hosts: ["example.com", "*.example.com"] },
          ],
        }),
      },
    },
    r2: {
      buckets: {
        list: vi.fn().mockResolvedValue({
          buckets: [
            { name: "my-bucket", creation_date: "2024-01-01T00:00:00Z", location: "WNAM" },
          ],
        }),
        get: vi.fn().mockResolvedValue({
          name: "my-bucket",
          creation_date: "2024-01-01T00:00:00Z",
          location: "WNAM",
        }),
      },
    },
    firewall: {
      rules: {
        list: vi.fn().mockResolvedValue({
          result: [
            {
              id: "rule-001",
              action: "block",
              description: "阻止恶意 IP",
              paused: false,
              filter: { expression: 'ip.src eq 1.2.3.4' },
            },
          ],
        }),
      },
    },
  } as any;
}

// ─── 测试主体 ───

describe("Cloudflare App 集成测试", () => {
  let mockHubHandle: { server: http.Server; close: () => Promise<void> };
  let appServer: http.Server;
  let store: Store;
  let router: Router;

  beforeAll(async () => {
    // 1. 启动 Mock Hub Server
    mockHubHandle = await startMockHub();

    // 2. 初始化内存数据库和存储
    store = new Store(":memory:");

    // 3. 注入 installation 记录（模拟已完成 OAuth 安装）
    store.saveInstallation({
      id: MOCK_INSTALLATION_ID,
      hubUrl: MOCK_HUB_URL,
      appId: "cloudflare",
      botId: MOCK_BOT_ID,
      appToken: MOCK_APP_TOKEN,
      webhookSecret: MOCK_WEBHOOK_SECRET,
      createdAt: new Date().toISOString(),
    });

    // 4. 使用 Mock Cloudflare 客户端收集工具并创建路由
    const mockClient = createMockCloudflare();
    const { handlers } = collectAllTools(mockClient);
    router = new Router(handlers);

    // 5. 启动轻量 App HTTP 服务器
    appServer = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${APP_PORT}`);

      if (req.method === "POST" && url.pathname === "/hub/webhook") {
        await handleWebhook(req, res, {
          store,
          onCommand: async (event, installation) => {
            if (!event.event) return null;
            const hubClient = new HubClient(installation.hubUrl, installation.appToken);
            return router.handleCommand(event, installation, hubClient);
          },
          getHubClient: (installation) =>
            new HubClient(installation.hubUrl, installation.appToken),
        });
        return;
      }

      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    });

    await new Promise<void>((resolve, reject) => {
      appServer.on("error", reject);
      appServer.listen(APP_PORT, () => {
        console.log(`[test] App Server 已启动，端口 ${APP_PORT}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) =>
      appServer.close(() => {
        console.log("[test] App Server 已关闭");
        resolve();
      }),
    );
    await mockHubHandle.close();
    store.close();
  });

  // ─── 基础健康检查 ───

  it("Mock Hub Server 健康检查", async () => {
    const res = await fetch(`${MOCK_HUB_URL}/health`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toEqual({ status: "ok" });
  });

  it("App Server 健康检查", async () => {
    const res = await fetch(`http://localhost:${APP_PORT}/health`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toEqual({ status: "ok" });
  });

  // ─── 命令执行测试 ───

  it("list_zones 命令应通过 Hub 链路返回域名列表", async () => {
    const result = await injectCommand("list_zones", {});

    expect(result.app_response.reply_type).toBe("text");
    // reply_base64 解码后应包含域名信息
    const reply = Buffer.from(result.app_response.reply_base64, "base64").toString("utf-8");
    expect(reply).toContain("example.com");
  });

  it("create_dns_record 命令应通过 Hub 链路返回创建结果", async () => {
    const result = await injectCommand("create_dns_record", {
      zone_id: "zone-001",
      type: "A",
      name: "api.example.com",
      content: "5.6.7.8",
    });

    const reply = Buffer.from(result.app_response.reply_base64, "base64").toString("utf-8");
    expect(reply).toContain("创建成功");
    expect(reply).toContain("api.example.com");
  });

  it("purge_cache_all 命令应返回清除成功", async () => {
    const result = await injectCommand("purge_cache_all", { zone_id: "zone-001" });

    const reply = Buffer.from(result.app_response.reply_base64, "base64").toString("utf-8");
    expect(reply).toContain("全部清除");
  });

  it("未知命令应返回错误提示", async () => {
    const result = await injectCommand("nonexistent_command", {});

    const reply = Buffer.from(result.app_response.reply_base64, "base64").toString("utf-8");
    expect(reply).toContain("未知命令");
  });

  // ─── Webhook 验证测试 ───

  it("无效签名的 webhook 请求应被拒绝（401）", async () => {
    const hubEvent = {
      v: 1,
      type: "event",
      trace_id: "tr_bad_sig",
      installation_id: MOCK_INSTALLATION_ID,
      bot: { id: MOCK_BOT_ID },
      event: {
        type: "command",
        id: "evt_bad",
        timestamp: Math.floor(Date.now() / 1000),
        data: { command: "list_zones", args: {}, user_id: "hacker" },
      },
    };

    const res = await fetch(`http://localhost:${APP_PORT}/hub/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Timestamp": "12345",
        "X-Signature": "sha256=invalid_signature_here",
      },
      body: JSON.stringify(hubEvent),
    });

    expect(res.status).toBe(401);
  });

  it("url_verification 请求应正确返回 challenge", async () => {
    const verifyEvent = {
      v: 1,
      type: "url_verification",
      challenge: "test_challenge_token_123",
    };

    const res = await fetch(`http://localhost:${APP_PORT}/hub/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(verifyEvent),
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toEqual({ challenge: "test_challenge_token_123" });
  });

  it("list_firewall_rules 命令应返回防火墙规则", async () => {
    const result = await injectCommand("list_firewall_rules", { zone_id: "zone-001" });

    const reply = Buffer.from(result.app_response.reply_base64, "base64").toString("utf-8");
    expect(reply).toContain("防火墙规则");
    expect(reply).toContain("阻止恶意 IP");
  });
});
