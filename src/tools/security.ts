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
  {
    name: "delete_ip_block",
    description: "取消 IP 封禁（删除 Access Rule）",
    command: "delete_ip_block",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        rule_id: { type: "string", description: "Access Rule ID（通过 list_firewall_rules 获取）" },
      },
      required: ["zone_id", "rule_id"],
    },
  },
  {
    name: "create_waf_rule",
    description: "创建 WAF 自定义规则（基于表达式的安全规则）",
    command: "create_waf_rule",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        description: { type: "string", description: "规则描述" },
        expression: { type: "string", description: "规则表达式（Cloudflare 过滤器语法，如 ip.src == 1.2.3.4）" },
        action: { type: "string", description: "触发动作: block / challenge / js_challenge / managed_challenge / log" },
      },
      required: ["zone_id", "expression", "action"],
    },
  },
  {
    name: "update_waf_rule",
    description: "更新 WAF 自定义规则",
    command: "update_waf_rule",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        ruleset_id: { type: "string", description: "Ruleset ID" },
        rule_id: { type: "string", description: "Rule ID" },
        description: { type: "string", description: "规则描述（可选）" },
        expression: { type: "string", description: "规则表达式（可选）" },
        action: { type: "string", description: "触发动作（可选）" },
        enabled: { type: "boolean", description: "是否启用（可选）" },
      },
      required: ["zone_id", "ruleset_id", "rule_id"],
    },
  },
  {
    name: "delete_waf_rule",
    description: "删除 WAF 自定义规则",
    command: "delete_waf_rule",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        ruleset_id: { type: "string", description: "Ruleset ID" },
        rule_id: { type: "string", description: "Rule ID" },
      },
      required: ["zone_id", "ruleset_id", "rule_id"],
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

  // 取消 IP 封禁
  handlers.set("delete_ip_block", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";
    const ruleId: string = ctx.args.rule_id ?? "";

    try {
      const client = getClient() as any;
      await client.firewall.accessRules.rules.delete(ruleId, {
        zone_id: zoneId,
      });

      return `IP 封禁已取消!\n规则 ID: ${ruleId}`;
    } catch (err: any) {
      return `取消 IP 封禁失败: ${err.message ?? err}`;
    }
  });

  // 创建 WAF 自定义规则
  handlers.set("create_waf_rule", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";
    const description: string = ctx.args.description ?? "";
    const expression: string = ctx.args.expression ?? "";
    const action: string = ctx.args.action ?? "block";

    try {
      const client = getClient() as any;

      // 先查找 http_request_firewall_custom 阶段的 ruleset
      let rulesetId: string | null = null;
      try {
        const rulesets = await client.rulesets.list({ zone_id: zoneId });
        const items = rulesets.result ?? rulesets ?? [];
        const arr = Array.isArray(items) ? items : [items];
        const customRuleset = arr.find(
          (rs: any) => rs.phase === "http_request_firewall_custom"
        );
        if (customRuleset) {
          rulesetId = customRuleset.id;
        }
      } catch {
        // 忽略，使用创建新 ruleset 的方式
      }

      let result: any;
      if (rulesetId) {
        // 向已有 ruleset 追加规则
        result = await client.rulesets.rules.create(rulesetId, {
          zone_id: zoneId,
          action,
          expression,
          description,
          enabled: true,
        });
      } else {
        // 创建新的 custom ruleset
        result = await client.rulesets.create({
          zone_id: zoneId,
          name: "OpeniLink 自定义 WAF 规则集",
          kind: "zone",
          phase: "http_request_firewall_custom",
          rules: [
            {
              action,
              expression,
              description,
              enabled: true,
            },
          ],
        });
      }

      return `WAF 自定义规则创建成功!\n动作: ${action}\n表达式: ${expression}\n描述: ${description || "（无）"}\n\n提示: 可在 Cloudflare Dashboard → Security → WAF 中查看和管理。`;
    } catch (err: any) {
      return `创建 WAF 规则失败: ${err.message ?? err}`;
    }
  });

  // 更新 WAF 自定义规则
  handlers.set("update_waf_rule", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";
    const rulesetId: string = ctx.args.ruleset_id ?? "";
    const ruleId: string = ctx.args.rule_id ?? "";
    const description: string | undefined = ctx.args.description;
    const expression: string | undefined = ctx.args.expression;
    const action: string | undefined = ctx.args.action;
    const enabled: boolean | undefined = ctx.args.enabled;

    try {
      const client = getClient() as any;

      const updateParams: any = { zone_id: zoneId };
      if (description !== undefined) updateParams.description = description;
      if (expression !== undefined) updateParams.expression = expression;
      if (action !== undefined) updateParams.action = action;
      if (enabled !== undefined) updateParams.enabled = enabled;

      await client.rulesets.rules.edit(rulesetId, ruleId, updateParams);

      return `WAF 规则更新成功!\nRuleset ID: ${rulesetId}\nRule ID: ${ruleId}`;
    } catch (err: any) {
      return `更新 WAF 规则失败: ${err.message ?? err}`;
    }
  });

  // 删除 WAF 自定义规则
  handlers.set("delete_waf_rule", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";
    const rulesetId: string = ctx.args.ruleset_id ?? "";
    const ruleId: string = ctx.args.rule_id ?? "";

    try {
      const client = getClient() as any;
      await client.rulesets.rules.delete(rulesetId, ruleId, {
        zone_id: zoneId,
      });

      return `WAF 规则已删除!\nRuleset ID: ${rulesetId}\nRule ID: ${ruleId}`;
    } catch (err: any) {
      return `删除 WAF 规则失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** Security Tool 模块（原 Firewall，已扩展） */
export const securityTools: ToolModule = { definitions, createHandlers };
