import type { Config } from "../config.js";
import type { ToolDefinition } from "./types.js";

/** Manifest 结构（注册到 Hub 的 App 描述） */
export interface Manifest {
  slug: string;
  name: string;
  description: string;
  icon: string;
  events: string[];
  scopes: string[];
  tools: ToolDefinition[];
  oauth_setup_url: string;
  oauth_redirect_url: string;
  webhook_url: string;
  /** 配置表单 JSON Schema */
  config_schema?: Record<string, unknown>;
  /** 安装引导说明（Markdown） */
  guide?: string;
}

/**
 * 生成完整的 App Manifest，用于向 Hub 注册
 * @param config 应用配置
 * @param toolDefinitions 工具定义列表
 */
export function getManifest(
  config: Config,
  toolDefinitions: ToolDefinition[] = [],
): Manifest {
  const baseUrl = config.baseUrl;

  return {
    slug: "cloudflare",
    name: "Cloudflare",
    description: "通过微信管理 Cloudflare 域名、DNS、Workers、R2、缓存、SSL 和防火墙",
    icon: "🔶",
    events: ["command"],
    scopes: ["tools:write"],
    tools: toolDefinitions,
    oauth_setup_url: `${baseUrl}/oauth/setup`,
    oauth_redirect_url: `${baseUrl}/oauth/redirect`,
    webhook_url: `${baseUrl}/hub/webhook`,
    config_schema: {
      type: "object",
      properties: {
        cloudflare_api_token: {
          type: "string",
          title: "Cloudflare API Token",
          description: "在 Cloudflare Dashboard → My Profile → API Tokens 创建",
        },
        cloudflare_account_id: {
          type: "string",
          title: "Cloudflare Account ID（可选）",
          description: "用于 Workers/R2 等需要 Account 级别权限的操作，在 Dashboard 首页右侧可找到",
        },
      },
      required: ["cloudflare_api_token"],
    },
    guide: [
      "## Cloudflare 安装指南",
      "### 第 1 步",
      "登录 [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)",
      "### 第 2 步",
      "点击 **Create Token** → 选择 **Edit zone DNS** 模板（或自定义权限）",
      "### 第 3 步",
      "根据需要添加以下权限:",
      "- Zone: DNS (Edit) — DNS 管理",
      "- Zone: Zone (Read) — 域名列表",
      "- Zone: Cache Purge (Purge) — 缓存清理",
      "- Zone: SSL and Certificates (Read) — SSL 证书查看",
      "- Zone: Firewall Services (Read) — 防火墙规则查看",
      "- Account: Workers Scripts (Read) — Workers 管理",
      "- Account: Workers R2 Storage (Read/Write) — R2 存储管理",
      "### 第 4 步",
      "复制生成的 API Token 填入上方配置并安装",
      "",
      "安装后可通过 /settings 页面随时修改配置。",
    ].join("\n"),
  };
}
