/**
 * Security Tools
 * 提供 Cloudflare 防火墙规则、安全事件、WAF 规则、IP 封禁、速率限制能力
 */
import type Cloudflare from "cloudflare";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";
import type { ToolModule } from "./index.js";

/** Security 模块 tool 定义列表 */
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
  {
    name: "list_waf_rules",
    description: "列出域名的 WAF 规则集（Rulesets）",
    command: "list_waf_rules",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "create_ip_block",
    description: "封禁指定 IP 地址",
    command: "create_ip_block",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        ip: { type: "string", description: "要封禁的 IP 地址" },
      },
      required: ["zone_id", "ip"],
    },
  },
  {
    name: "list_rate_limits",
    description: "列出域名的速率限制规则",
    command: "list_rate_limits",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
      },
      required: ["zone_id"],
    },
  },
];

/** 创建 Security 模块的 handler 映射，接收 client 工厂函数实现 per-installation 隔离 */
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

  // 列出 WAF 规则集
  handlers.set("list_waf_rules", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      const res = await (getClient() as any).rulesets.list({ zone_id: zoneId });
      const rulesets = res.result ?? [];

      if (Array.isArray(rulesets) && rulesets.length === 0) {
        return "暂无 WAF 规则集";
      }

      const items = Array.isArray(rulesets) ? rulesets : [rulesets];
      const lines = items.map((rs: any, i: number) => {
        const name = rs.name ?? "未命名";
        const kind = rs.kind ?? "N/A";
        const phase = rs.phase ?? "N/A";
        const rulesCount = rs.rules?.length ?? 0;
        return `${i + 1}. ${name}\n   类型: ${kind} | 阶段: ${phase}\n   规则数: ${rulesCount}\n   ID: ${rs.id}`;
      });

      return `WAF 规则集列表（共 ${items.length} 个）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `列出 WAF 规则集失败: ${err.message ?? err}`;
    }
  });

  // 封禁 IP
  handlers.set("create_ip_block", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";
    const ip: string = ctx.args.ip ?? "";

    try {
      // 通过 Access Rules 封禁 IP
      const client = getClient() as any;
      const res = await client.firewall.accessRules.rules.create({
        zone_id: zoneId,
        mode: "block",
        configuration: {
          target: "ip",
          value: ip,
        },
        notes: `通过 OpeniLink 封禁 IP: ${ip}`,
      });
      const rule = res as any;

      return `IP 封禁成功!\nIP: ${ip}\n操作: block\n规则 ID: ${rule.id ?? "N/A"}\n\n提示: 可在 Cloudflare Dashboard → Security → WAF → Tools 中管理封禁列表。`;
    } catch (err: any) {
      return `封禁 IP 失败: ${err.message ?? err}`;
    }
  });

  // 列出速率限制
  handlers.set("list_rate_limits", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      const client = getClient() as any;
      const res = await client.rateLimits.list({ zone_id: zoneId });
      const limits = res.result ?? [];

      if (Array.isArray(limits) && limits.length === 0) {
        return "暂无速率限制规则\n\n提示: 新版速率限制建议通过 WAF 自定义规则配置，可在 Cloudflare Dashboard → Security → WAF 中设置。";
      }

      const items = Array.isArray(limits) ? limits : [limits];
      const lines = items.map((rl: any, i: number) => {
        const threshold = rl.threshold ?? "N/A";
        const period = rl.period ?? "N/A";
        const action = rl.action?.mode ?? "N/A";
        const url = rl.match?.request?.url ?? "N/A";
        const disabled = rl.disabled ? "⏸ 已禁用" : "▶ 活跃";
        return `${i + 1}. ${url} ${disabled}\n   阈值: ${threshold} 次/${period}s\n   动作: ${action}\n   ID: ${rl.id}`;
      });

      return `速率限制规则列表（共 ${items.length} 条）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `列出速率限制失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** Security Tool 模块（原 Firewall，已扩展） */
export const securityTools: ToolModule = { definitions, createHandlers };
