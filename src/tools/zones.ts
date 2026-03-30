/**
 * Zones Tools
 * 提供 Cloudflare 域名（Zone）级别的设置管理、暂停/恢复、删除等能力
 */
import type Cloudflare from "cloudflare";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";
import type { ToolModule } from "./index.js";

/** Zones 模块 tool 定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "list_zone_settings",
    description: "列出域名的所有 Cloudflare 设置项",
    command: "list_zone_settings",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "update_zone_setting",
    description: "更新域名的某个设置（如 ssl、minify、always_use_https 等）",
    command: "update_zone_setting",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        setting_id: { type: "string", description: "设置项 ID（如 ssl、always_use_https、minify、security_level 等）" },
        value: { type: "string", description: "设置值（字符串或 JSON 字符串，如 \"on\"、\"off\"、\"full\" 等）" },
      },
      required: ["zone_id", "setting_id", "value"],
    },
  },
  {
    name: "enable_always_https",
    description: "开启 Always Use HTTPS（将所有 HTTP 请求重定向到 HTTPS）",
    command: "enable_always_https",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "set_ssl_mode",
    description: "设置域名的 SSL 模式",
    command: "set_ssl_mode",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        mode: { type: "string", description: "SSL 模式: off / flexible / full / strict" },
      },
      required: ["zone_id", "mode"],
    },
  },
  {
    name: "pause_zone",
    description: "暂停域名（Cloudflare 将不再代理该域名的流量）",
    command: "pause_zone",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "resume_zone",
    description: "恢复域名（重新启用 Cloudflare 代理）",
    command: "resume_zone",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "delete_zone",
    description: "删除域名（从 Cloudflare 中移除该域名）",
    command: "delete_zone",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
      },
      required: ["zone_id"],
    },
  },
];

/** 创建 Zones 模块的 handler 映射，接收 client 工厂函数实现 per-installation 隔离 */
function createHandlers(getClient: () => Cloudflare): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 列出域名所有设置
  handlers.set("list_zone_settings", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      const client = getClient() as any;
      // zones.settings.list 返回所有设置项
      const res = await client.zones.settings.list({ zone_id: zoneId });
      const settings = res.result ?? res ?? [];

      if (Array.isArray(settings) && settings.length === 0) {
        return "未获取到域名设置";
      }

      const items = Array.isArray(settings) ? settings : [settings];
      const lines = [`域名设置（共 ${items.length} 项）:`, ""];

      for (const s of items) {
        const id = s.id ?? "unknown";
        const value = typeof s.value === "object" ? JSON.stringify(s.value) : s.value;
        const editable = s.editable ? "" : " [只读]";
        lines.push(`  ${id}: ${value}${editable}`);
      }

      return lines.join("\n");
    } catch (err: any) {
      return `列出域名设置失败: ${err.message ?? err}`;
    }
  });

  // 更新域名设置
  handlers.set("update_zone_setting", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";
    const settingId: string = ctx.args.setting_id ?? "";
    const rawValue: string = ctx.args.value ?? "";

    // 尝试将 value 解析为 JSON（支持复杂值如 minify 的对象格式）
    let value: any = rawValue;
    try {
      value = JSON.parse(rawValue);
    } catch {
      // 保持字符串形式
    }

    try {
      await getClient().zones.settings.edit(settingId, {
        zone_id: zoneId,
        value,
      });

      return `域名设置更新成功!\n设置项: ${settingId}\n新值: ${typeof value === "object" ? JSON.stringify(value) : value}`;
    } catch (err: any) {
      return `更新域名设置失败: ${err.message ?? err}`;
    }
  });

  // 开启 Always Use HTTPS
  handlers.set("enable_always_https", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      await getClient().zones.settings.edit("always_use_https", {
        zone_id: zoneId,
        value: "on" as any,
      });

      return `Always Use HTTPS 已开启!\nZone ID: ${zoneId}\n\n所有 HTTP 请求将自动重定向到 HTTPS。`;
    } catch (err: any) {
      return `开启 Always Use HTTPS 失败: ${err.message ?? err}`;
    }
  });

  // 设置 SSL 模式
  handlers.set("set_ssl_mode", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";
    const mode: string = ctx.args.mode ?? "";

    const validModes = ["off", "flexible", "full", "strict"];
    if (!validModes.includes(mode)) {
      return `无效的 SSL 模式: ${mode}\n\n可选值:\n  off - 关闭 SSL\n  flexible - 灵活（浏览器到 CF 加密）\n  full - 完全（端到端加密，不验证源站证书）\n  strict - 完全严格（端到端加密，验证源站证书）`;
    }

    try {
      await getClient().zones.settings.edit("ssl", {
        zone_id: zoneId,
        value: mode as any,
      });

      const modeDesc: Record<string, string> = {
        off: "关闭 — 不加密",
        flexible: "灵活 — 浏览器到 Cloudflare 加密",
        full: "完全 — 端到端加密（不验证源站证书）",
        strict: "完全（严格） — 端到端加密（验证源站证书）",
      };

      return `SSL 模式设置成功!\n模式: ${mode}\n说明: ${modeDesc[mode] ?? mode}`;
    } catch (err: any) {
      return `设置 SSL 模式失败: ${err.message ?? err}`;
    }
  });

  // 暂停域名
  handlers.set("pause_zone", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      const res = await getClient().zones.edit({
        zone_id: zoneId,
        paused: true,
      });
      const zone = res as any;

      return `域名已暂停!\n域名: ${zone.name ?? zoneId}\n\n注意: Cloudflare 将不再代理该域名的流量，DNS 记录将直接指向源站。`;
    } catch (err: any) {
      return `暂停域名失败: ${err.message ?? err}`;
    }
  });

  // 恢复域名
  handlers.set("resume_zone", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      const res = await getClient().zones.edit({
        zone_id: zoneId,
        paused: false,
      });
      const zone = res as any;

      return `域名已恢复!\n域名: ${zone.name ?? zoneId}\n\nCloudflare 代理已重新启用。`;
    } catch (err: any) {
      return `恢复域名失败: ${err.message ?? err}`;
    }
  });

  // 删除域名
  handlers.set("delete_zone", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      await getClient().zones.delete({ zone_id: zoneId });

      return `域名已从 Cloudflare 中删除!\nZone ID: ${zoneId}\n\n注意: 域名的 DNS 将不再由 Cloudflare 管理，请确保已在域名注册商处更改 NS 记录。`;
    } catch (err: any) {
      return `删除域名失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** Zones Tool 模块 */
export const zonesTools: ToolModule = { definitions, createHandlers };
