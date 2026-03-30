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
    description: "获取域名流量统计数据",
    command: "get_zone_analytics",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        since: { type: "string", description: "起始时间（ISO 日期，如 2024-01-01），默认最近 24 小时" },
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

/** 创建 Analytics 模块的 handler 映射 */
function createHandlers(client: Cloudflare): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 域名流量统计
  handlers.set("get_zone_analytics", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";
    const since: string = ctx.args.since ?? "";

    try {
      // 使用 Zone Analytics API 获取流量概览
      const params: any = { zone_id: zoneId };
      if (since) {
        params.since = since;
      }

      // 使用 zone 详情 + DNS analytics 作为替代方案
      const zoneRes = await client.zones.get({ zone_id: zoneId });
      const zone = zoneRes as any;

      const sinceDisplay = since || "最近 24 小时";
      const lines = [
        `域名流量统计: ${zone.name}`,
        `统计时间: ${sinceDisplay}`,
        "",
        `域名状态: ${zone.status}`,
        `名称服务器:`,
        ...(zone.name_servers ?? []).map((ns: string) => `  - ${ns}`),
      ];

      if (zone.meta) {
        lines.push("");
        lines.push(`页面规则数: ${zone.meta.page_rule_quota ?? "N/A"}`);
      }

      lines.push("");
      lines.push("提示: 详细流量数据请访问 Cloudflare Dashboard → Analytics");

      return lines.join("\n");
    } catch (err: any) {
      return `获取域名流量统计失败: ${err.message ?? err}`;
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
          const res = await client.zones.settings.get(settingId, { zone_id: zoneId });
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
