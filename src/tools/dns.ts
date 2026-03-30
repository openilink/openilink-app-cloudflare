/**
 * DNS Tools
 * 提供 Cloudflare DNS 域名和记录的列出、创建、更新、删除能力
 */
import type Cloudflare from "cloudflare";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";
import type { ToolModule } from "./index.js";

/** DNS 模块 tool 定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "list_zones",
    description: "列出 Cloudflare 域名（Zone）",
    command: "list_zones",
    parameters: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "返回数量，默认 20",
        },
      },
    },
  },
  {
    name: "list_dns_records",
    description: "列出指定域名的 DNS 记录",
    command: "list_dns_records",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        type: {
          type: "string",
          description: "记录类型过滤: A / AAAA / CNAME / MX / TXT（可选）",
        },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "create_dns_record",
    description: "在指定域名下创建 DNS 记录",
    command: "create_dns_record",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        type: { type: "string", description: "记录类型: A / AAAA / CNAME / MX / TXT 等" },
        name: { type: "string", description: "记录名称（如 www, @, sub.example.com）" },
        content: { type: "string", description: "记录值（如 IP 地址、目标域名等）" },
        ttl: { type: "number", description: "TTL 秒数，1 表示自动（可选）" },
        proxied: { type: "boolean", description: "是否通过 Cloudflare 代理（可选）" },
      },
      required: ["zone_id", "type", "name", "content"],
    },
  },
  {
    name: "update_dns_record",
    description: "更新指定 DNS 记录",
    command: "update_dns_record",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        record_id: { type: "string", description: "DNS 记录 ID" },
        type: { type: "string", description: "记录类型" },
        name: { type: "string", description: "记录名称" },
        content: { type: "string", description: "记录值" },
      },
      required: ["zone_id", "record_id", "type", "name", "content"],
    },
  },
  {
    name: "delete_dns_record",
    description: "删除指定 DNS 记录",
    command: "delete_dns_record",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        record_id: { type: "string", description: "DNS 记录 ID" },
      },
      required: ["zone_id", "record_id"],
    },
  },
];

/** 创建 DNS 模块的 handler 映射，接收 client 工厂函数实现 per-installation 隔离 */
function createHandlers(getClient: () => Cloudflare): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 列出域名
  handlers.set("list_zones", async (ctx) => {
    const count = (ctx.args.count as number) ?? 20;

    try {
      const res = await getClient().zones.list({ per_page: count });
      const zones = res.result ?? [];

      if (zones.length === 0) {
        return "暂无域名";
      }

      const lines = zones.map((z: any, i: number) => {
        const status = z.status === "active" ? "✅ 活跃" : `⏳ ${z.status}`;
        const plan = z.plan?.name ?? "Free";
        return `${i + 1}. ${z.name} ${status}\n   ID: ${z.id}\n   套餐: ${plan}`;
      });

      return `域名列表（共 ${zones.length} 个）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `列出域名失败: ${err.message ?? err}`;
    }
  });

  // 列出 DNS 记录
  handlers.set("list_dns_records", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      const params: any = { zone_id: zoneId };
      if (ctx.args.type) {
        params.type = ctx.args.type;
      }

      const res = await getClient().dns.records.list(params);
      const records = res.result ?? [];

      if (records.length === 0) {
        return "暂无 DNS 记录";
      }

      const lines = records.map((r: any, i: number) => {
        const proxied = r.proxied ? "🟠 代理" : "⚪ 直连";
        return `${i + 1}. ${r.type} ${r.name} → ${r.content} ${proxied}\n   ID: ${r.id} | TTL: ${r.ttl === 1 ? "自动" : r.ttl + "s"}`;
      });

      return `DNS 记录列表（共 ${records.length} 条）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `列出 DNS 记录失败: ${err.message ?? err}`;
    }
  });

  // 创建 DNS 记录
  handlers.set("create_dns_record", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";
    const type: string = ctx.args.type ?? "";
    const name: string = ctx.args.name ?? "";
    const content: string = ctx.args.content ?? "";
    const ttl: number | undefined = ctx.args.ttl;
    const proxied: boolean | undefined = ctx.args.proxied;

    try {
      const params: any = {
        zone_id: zoneId,
        type,
        name,
        content,
      };
      if (ttl !== undefined) params.ttl = ttl;
      if (proxied !== undefined) params.proxied = proxied;

      const res = await getClient().dns.records.create(params);
      const record = res as any;

      return `DNS 记录创建成功!\n类型: ${record.type}\n名称: ${record.name}\n值: ${record.content}\nID: ${record.id}`;
    } catch (err: any) {
      return `创建 DNS 记录失败: ${err.message ?? err}`;
    }
  });

  // 更新 DNS 记录
  handlers.set("update_dns_record", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";
    const recordId: string = ctx.args.record_id ?? "";
    const type: string = ctx.args.type ?? "";
    const name: string = ctx.args.name ?? "";
    const content: string = ctx.args.content ?? "";

    try {
      const res = await getClient().dns.records.update(recordId, {
        zone_id: zoneId,
        type: type as any,
        name,
        content,
        ttl: 1, // 1 表示自动
      } as any);
      const record = res as any;

      return `DNS 记录更新成功!\n类型: ${record.type}\n名称: ${record.name}\n值: ${record.content}`;
    } catch (err: any) {
      return `更新 DNS 记录失败: ${err.message ?? err}`;
    }
  });

  // 删除 DNS 记录
  handlers.set("delete_dns_record", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";
    const recordId: string = ctx.args.record_id ?? "";

    try {
      await getClient().dns.records.delete(recordId, { zone_id: zoneId });
      return `DNS 记录已删除!\nRecord ID: ${recordId}`;
    } catch (err: any) {
      return `删除 DNS 记录失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** DNS Tool 模块 */
export const dnsTools: ToolModule = { definitions, createHandlers };
