/**
 * SSL Tools
 * 提供 Cloudflare SSL 证书状态查看和证书列表能力
 */
import type Cloudflare from "cloudflare";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";
import type { ToolModule } from "./index.js";

/** SSL 模块 tool 定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "get_ssl_status",
    description: "获取域名的 SSL 证书状态",
    command: "get_ssl_status",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "list_certificates",
    description: "列出域名的 SSL 证书",
    command: "list_certificates",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
      },
      required: ["zone_id"],
    },
  },
];

/** 创建 SSL 模块的 handler 映射，接收 client 工厂函数实现 per-installation 隔离 */
function createHandlers(getClient: () => Cloudflare): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // SSL 证书状态
  handlers.set("get_ssl_status", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      // 获取 SSL 设置
      const sslRes = await getClient().zones.settings.get("ssl", { zone_id: zoneId });
      const ssl = sslRes as any;

      // 获取 zone 信息以展示域名
      const zoneRes = await getClient().zones.get({ zone_id: zoneId });
      const zone = zoneRes as any;

      const sslMode = ssl.value ?? "unknown";
      const modeDesc: Record<string, string> = {
        off: "关闭 — 不加密",
        flexible: "灵活 — 浏览器到 Cloudflare 加密",
        full: "完全 — 端到端加密（不验证源站证书）",
        strict: "完全（严格） — 端到端加密（验证源站证书）",
      };

      const lines = [
        `SSL 证书状态: ${zone.name}`,
        "",
        `SSL 模式: ${sslMode}`,
        `说明: ${modeDesc[sslMode] ?? sslMode}`,
        "",
        `Zone ID: ${zoneId}`,
        `域名状态: ${zone.status}`,
      ];

      return lines.join("\n");
    } catch (err: any) {
      return `获取 SSL 状态失败: ${err.message ?? err}`;
    }
  });

  // 列出证书
  handlers.set("list_certificates", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      const res = await getClient().ssl.certificatePacks.list({ zone_id: zoneId });
      const certs = res.result ?? [];

      if (certs.length === 0) {
        return "暂无 SSL 证书包";
      }

      const lines = certs.map((c: any, i: number) => {
        const status = c.status ?? "unknown";
        const type = c.type ?? "unknown";
        const hosts = (c.hosts ?? []).join(", ");
        return `${i + 1}. 类型: ${type} | 状态: ${status}\n   覆盖域名: ${hosts || "N/A"}\n   ID: ${c.id}`;
      });

      return `SSL 证书列表（共 ${certs.length} 个）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `列出证书失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** SSL Tool 模块 */
export const sslTools: ToolModule = { definitions, createHandlers };
