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
  {
    name: "order_ssl_certificate",
    description: "订购高级 SSL 证书包（Advanced Certificate Manager）",
    command: "order_ssl_certificate",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        hosts: { type: "string", description: "证书覆盖的主机名，多个用逗号分隔（如 example.com,*.example.com）" },
        type: { type: "string", description: "证书类型: advanced（默认）" },
        validation_method: { type: "string", description: "验证方式: txt / http / email（默认 txt）" },
        certificate_authority: { type: "string", description: "CA 机构: lets_encrypt / google（默认 lets_encrypt）" },
      },
      required: ["zone_id", "hosts"],
    },
  },
  {
    name: "delete_ssl_certificate",
    description: "删除 SSL 证书包",
    command: "delete_ssl_certificate",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        certificate_pack_id: { type: "string", description: "证书包 ID" },
      },
      required: ["zone_id", "certificate_pack_id"],
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

  // 订购 SSL 证书包
  handlers.set("order_ssl_certificate", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";
    const hostsRaw: string = ctx.args.hosts ?? "";
    const type: string = ctx.args.type ?? "advanced";
    const validationMethod: string = ctx.args.validation_method ?? "txt";
    const ca: string = ctx.args.certificate_authority ?? "lets_encrypt";

    const hosts = hostsRaw.split(",").map((h: string) => h.trim()).filter(Boolean);

    if (hosts.length === 0) {
      return "请提供至少一个主机名";
    }

    try {
      const client = getClient() as any;
      const res = await client.ssl.certificatePacks.order({
        zone_id: zoneId,
        type,
        hosts,
        validation_method: validationMethod,
        certificate_authority: ca,
      });
      const cert = res as any;

      const lines = [
        "SSL 证书订购成功!",
        `类型: ${type}`,
        `CA: ${ca}`,
        `验证方式: ${validationMethod}`,
        `覆盖域名: ${hosts.join(", ")}`,
        `证书包 ID: ${cert.id ?? "N/A"}`,
        `状态: ${cert.status ?? "pending"}`,
        "",
        "提示: 证书签发可能需要几分钟，请稍后使用 list_certificates 查看状态。",
      ];

      return lines.join("\n");
    } catch (err: any) {
      return `订购 SSL 证书失败: ${err.message ?? err}\n\n提示: 高级证书功能可能需要付费套餐（Advanced Certificate Manager）。`;
    }
  });

  // 删除 SSL 证书包
  handlers.set("delete_ssl_certificate", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";
    const certPackId: string = ctx.args.certificate_pack_id ?? "";

    try {
      const client = getClient() as any;
      await client.ssl.certificatePacks.delete(certPackId, {
        zone_id: zoneId,
      });

      return `SSL 证书包已删除!\n证书包 ID: ${certPackId}\n\n注意: 删除证书后对应域名将回退到通用证书（Universal SSL）。`;
    } catch (err: any) {
      return `删除 SSL 证书失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** SSL Tool 模块 */
export const sslTools: ToolModule = { definitions, createHandlers };
