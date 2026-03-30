/**
 * Firewall Tools
 * 提供 Cloudflare 防火墙规则和安全事件查看能力
 */
import type Cloudflare from "cloudflare";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";
import type { ToolModule } from "./index.js";

/** Firewall 模块 tool 定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "list_firewall_rules",
    description: "列出域名的防火墙规则",
    command: "list_firewall_rules",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "get_security_events",
    description: "获取域名的安全事件记录",
    command: "get_security_events",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
      },
      required: ["zone_id"],
    },
  },
];

/** 创建 Firewall 模块的 handler 映射，接收 client 工厂函数实现 per-installation 隔离 */
function createHandlers(getClient: () => Cloudflare): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 列出防火墙规则
  handlers.set("list_firewall_rules", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      const res = await getClient().firewall.rules.list({ zone_id: zoneId });
      const rules = res.result ?? [];

      if (rules.length === 0) {
        return "暂无防火墙规则";
      }

      const lines = rules.map((r: any, i: number) => {
        const action = r.action ?? "unknown";
        const desc = r.description ?? "无描述";
        const paused = r.paused ? "⏸ 已暂停" : "▶ 活跃";
        const expression = r.filter?.expression ?? "N/A";
        return `${i + 1}. ${desc} [${action}] ${paused}\n   表达式: ${expression}\n   ID: ${r.id}`;
      });

      return `防火墙规则列表（共 ${rules.length} 条）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `列出防火墙规则失败: ${err.message ?? err}`;
    }
  });

  // 安全事件
  handlers.set("get_security_events", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      // 获取域名安全级别设置作为安全概览
      const secRes = await getClient().zones.settings.get("security_level", { zone_id: zoneId });
      const secLevel = (secRes as any).value ?? "unknown";

      const zoneRes = await getClient().zones.get({ zone_id: zoneId });
      const zone = zoneRes as any;

      const levelDesc: Record<string, string> = {
        essentially_off: "基本关闭",
        low: "低",
        medium: "中",
        high: "高",
        under_attack: "攻击模式",
      };

      const lines = [
        `安全概览: ${zone.name}`,
        "",
        `安全级别: ${levelDesc[secLevel] ?? secLevel}`,
        `域名状态: ${zone.status}`,
      ];

      if (zone.meta) {
        lines.push(`WAF 规则: ${zone.meta.phishing_detected ? "检测到钓鱼风险" : "正常"}`);
      }

      lines.push("");
      lines.push("提示: 详细安全事件日志请访问 Cloudflare Dashboard → Security → Events");

      return lines.join("\n");
    } catch (err: any) {
      return `获取安全事件失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** Firewall Tool 模块 */
export const firewallTools: ToolModule = { definitions, createHandlers };
