/**
 * Analytics Tools
 * 提供 Cloudflare 域名流量统计、配置查看、流量分析能力
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
  {
    name: "get_traffic_analytics",
    description: "获取域名的流量分析数据（请求量、带宽、威胁等）",
    command: "get_traffic_analytics",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        since: { type: "string", description: "开始时间（ISO 格式），默认 24 小时前（可选）" },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "get_web_analytics",
    description: "获取 Web Analytics 站点列表和概览（无需修改网站代码的免费分析）",
    command: "get_web_analytics",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
      },
      required: ["account_id"],
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

  // 流量分析
  handlers.set("get_traffic_analytics", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";
    const since: string = ctx.args.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
      const client = getClient() as any;

      // 尝试使用 GraphQL Analytics API
      // 先通过 zones.analytics.dashboard 获取仪表板数据
      let analyticsData: any = null;

      try {
        // 优先尝试 dashboard API
        analyticsData = await client.zones.analytics.dashboard.get({
          zone_id: zoneId,
          since,
          until: new Date().toISOString(),
          continuous: true,
        });
      } catch {
        // 回退: 通过通用 HTTP 请求获取
        try {
          const sinceParam = encodeURIComponent(since);
          const untilParam = encodeURIComponent(new Date().toISOString());
          analyticsData = await client.get(
            `/zones/${zoneId}/analytics/dashboard?since=${sinceParam}&until=${untilParam}&continuous=true`
          );
        } catch {
          // 最终回退
        }
      }

      if (!analyticsData) {
        // 如果 API 不可用，提供基本信息和指引
        const zoneRes = await getClient().zones.get({ zone_id: zoneId });
        const zone = zoneRes as any;

        return [
          `流量分析: ${zone.name}`,
          "",
          "当前 API Token 可能缺少 Analytics 读取权限，无法获取详细流量数据。",
          "",
          "查看流量分析的方式:",
          "1. Cloudflare Dashboard → Analytics & Logs → Traffic",
          "2. 确保 API Token 包含 Zone Analytics:Read 权限",
          "3. 使用 GraphQL Analytics API: https://developers.cloudflare.com/analytics/graphql-api/",
        ].join("\n");
      }

      const data = analyticsData as any;
      const totals = data.totals ?? data.result?.totals ?? {};
      const timeseries = data.timeseries ?? data.result?.timeseries ?? [];

      const lines = [
        `流量分析（从 ${since} 起）:`,
        "",
      ];

      // 请求统计
      if (totals.requests) {
        const req = totals.requests;
        lines.push("📊 请求统计:");
        lines.push(`  总请求数: ${req.all?.toLocaleString() ?? "N/A"}`);
        lines.push(`  缓存命中: ${req.cached?.toLocaleString() ?? "N/A"}`);
        lines.push(`  未缓存: ${req.uncached?.toLocaleString() ?? "N/A"}`);

        if (req.ssl) {
          lines.push(`  HTTPS 请求: ${req.ssl?.encrypted?.toLocaleString() ?? "N/A"}`);
          lines.push(`  HTTP 请求: ${req.ssl?.unencrypted?.toLocaleString() ?? "N/A"}`);
        }
      }

      // 带宽统计
      if (totals.bandwidth) {
        const bw = totals.bandwidth;
        const formatBytes = (bytes: number) => {
          if (!bytes) return "0 B";
          const units = ["B", "KB", "MB", "GB", "TB"];
          const i = Math.floor(Math.log(bytes) / Math.log(1024));
          return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
        };

        lines.push("");
        lines.push("📶 带宽统计:");
        lines.push(`  总带宽: ${formatBytes(bw.all)}`);
        lines.push(`  缓存带宽: ${formatBytes(bw.cached)}`);
        lines.push(`  未缓存带宽: ${formatBytes(bw.uncached)}`);
      }

      // 威胁统计
      if (totals.threats) {
        const threats = totals.threats;
        lines.push("");
        lines.push("🛡 威胁统计:");
        lines.push(`  总威胁数: ${threats.all?.toLocaleString() ?? "0"}`);
      }

      // 页面浏览
      if (totals.pageviews) {
        lines.push("");
        lines.push("📄 页面浏览:");
        lines.push(`  总页面浏览: ${totals.pageviews.all?.toLocaleString() ?? "N/A"}`);
      }

      // 独立访客
      if (totals.uniques) {
        lines.push("");
        lines.push("👤 独立访客:");
        lines.push(`  总独立访客: ${totals.uniques.all?.toLocaleString() ?? "N/A"}`);
      }

      // 时间序列摘要
      if (timeseries.length > 0) {
        lines.push("");
        lines.push(`📈 数据点数: ${timeseries.length} 个时间段`);
      }

      return lines.join("\n");
    } catch (err: any) {
      return `获取流量分析失败: ${err.message ?? err}`;
    }
  });

  // Web Analytics 站点列表
  handlers.set("get_web_analytics", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";

    try {
      const client = getClient() as any;

      // Web Analytics 使用 rum 端点
      const res = await client.rum.siteInfo.list({ account_id: accountId });
      const sites = res.result ?? res ?? [];

      if (Array.isArray(sites) && sites.length === 0) {
        return "暂无 Web Analytics 站点\n\n提示: 可在 Cloudflare Dashboard → Analytics & Logs → Web Analytics 中添加站点。";
      }

      const items = Array.isArray(sites) ? sites : [sites];
      const lines = items.map((s: any, i: number) => {
        const host = s.host ?? s.hostname ?? "N/A";
        const created = s.created ?? s.created_on ?? "N/A";
        const siteTag = s.site_tag ?? s.tag ?? "N/A";
        return `${i + 1}. ${host}\n   Site Tag: ${siteTag}\n   创建时间: ${created}`;
      });

      return `Web Analytics 站点列表（共 ${items.length} 个）:\n${lines.join("\n")}\n\n提示: 详细分析数据请访问 Cloudflare Dashboard → Analytics & Logs → Web Analytics。`;
    } catch (err: any) {
      return `获取 Web Analytics 失败: ${err.message ?? err}\n\n提示: 该功能可能需要开启 Web Analytics 并确保 API Token 有相应权限。`;
    }
  });

  return handlers;
}

/** Analytics Tool 模块 */
export const analyticsTools: ToolModule = { definitions, createHandlers };
