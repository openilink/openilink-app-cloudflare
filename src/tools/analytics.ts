/**
 * Analytics Tools
 * 提供 Cloudflare 域名流量统计和配置查看能力
 */
import type Cloudflare from "cloudflare";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";
import type { ToolModule } from "./index.js";

/** Analytics 模块 tool 定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "get_zone_analytics",
    description: "获取域名基本信息（状态、名称服务器、套餐等）",
    command: "get_zone_analytics",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "get_zone_settings",
    description: "获取域名的 Cloudflare 配置信息",
    command: "get_zone_settings",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
      },
      required: ["zone_id"],
    },
  },
];

/** 创建 Analytics 模块的 handler 映射，接收 client 工厂函数实现 per-installation 隔离 */
function createHandlers(getClient: () => Cloudflare): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 域名基本信息
  handlers.set("get_zone_analytics", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      const zoneRes = await getClient().zones.get({ zone_id: zoneId });
      const zone = zoneRes as any;

      const lines = [
        `域名基本信息: ${zone.name}`,
        "",
        `域名状态: ${zone.status}`,
        `套餐: ${zone.plan?.name ?? "N/A"}`,
        `名称服务器:`,
        ...(zone.name_servers ?? []).map((ns: string) => `  - ${ns}`),
      ];

      if (zone.meta) {
        lines.push("");
        lines.push(`页面规则配额: ${zone.meta.page_rule_quota ?? "N/A"}`);
      }

      if (zone.created_on) lines.push(`创建时间: ${zone.created_on}`);
      if (zone.modified_on) lines.push(`修改时间: ${zone.modified_on}`);

      lines.push("");
      lines.push("提示: 详细流量统计数据请访问 Cloudflare Dashboard → Analytics");

      return lines.join("\n");
    } catch (err: any) {
      return `获取域名信息失败: ${err.message ?? err}`;
    }
  });

  // 域名配置
  handlers.set("get_zone_settings", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      // 逐个获取关键配置项（SDK 仅支持 get 单个设置）
      const keySettings = [
        "ssl", "always_use_https", "min_tls_version",
        "security_level", "browser_cache_ttl",
      ];

      const lines = [`域名配置（Zone ID: ${zoneId}）:`, ""];

      for (const settingId of keySettings) {
        try {
          const res = await getClient().zones.settings.get(settingId, { zone_id: zoneId });
          const setting = res as any;
          const value = typeof setting.value === "object" ? JSON.stringify(setting.value) : setting.value;
          lines.push(`${settingId}: ${value}`);
        } catch {
          // 某些设置可能不存在，跳过
          lines.push(`${settingId}: N/A`);
        }
      }

      return lines.join("\n");
    } catch (err: any) {
      return `获取域名配置失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** Analytics Tool 模块 */
export const analyticsTools: ToolModule = { definitions, createHandlers };
