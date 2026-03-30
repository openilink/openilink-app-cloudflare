/**
 * Workers Tools
 * 提供 Cloudflare Workers 的列出、详情、路由、日志查看能力
 */
import type Cloudflare from "cloudflare";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";
import type { ToolModule } from "./index.js";

/** Workers 模块 tool 定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "list_workers",
    description: "列出 Cloudflare Workers 脚本",
    command: "list_workers",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
      },
      required: ["account_id"],
    },
  },
  {
    name: "get_worker_info",
    description: "获取指定 Worker 的详细信息",
    command: "get_worker_info",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        script_name: { type: "string", description: "Worker 脚本名称" },
      },
      required: ["account_id", "script_name"],
    },
  },
  {
    name: "list_worker_routes",
    description: "列出域名绑定的 Worker 路由",
    command: "list_worker_routes",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "get_worker_logs",
    description: "查看 Worker 的最近日志（Tail）",
    command: "get_worker_logs",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        script_name: { type: "string", description: "Worker 脚本名称" },
      },
      required: ["account_id", "script_name"],
    },
  },
];

/** 创建 Workers 模块的 handler 映射，接收 client 工厂函数实现 per-installation 隔离 */
function createHandlers(getClient: () => Cloudflare): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 列出 Workers
  handlers.set("list_workers", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";

    try {
      const res = await getClient().workers.scripts.list({ account_id: accountId });
      const scripts = res.result ?? [];

      if (scripts.length === 0) {
        return "暂无 Workers 脚本";
      }

      const lines = scripts.map((s: any, i: number) => {
        const modified = s.modified_on ? `最后修改: ${s.modified_on}` : "";
        return `${i + 1}. ${s.id}\n   ${modified}`;
      });

      return `Workers 列表（共 ${scripts.length} 个）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `列出 Workers 失败: ${err.message ?? err}`;
    }
  });

  // Worker 详情（scripts.get 返回脚本源码字符串，内容过长不适合展示，改用 settings 获取元信息）
  handlers.set("get_worker_info", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const scriptName: string = ctx.args.script_name ?? "";

    try {
      const settings = await getClient().workers.scripts.settings.get(scriptName, {
        account_id: accountId,
      });
      const meta = settings as any;

      const lines = [
        `Worker: ${scriptName}`,
        `Account: ${accountId}`,
      ];

      if (meta.modified_on) lines.push(`最后修改: ${meta.modified_on}`);
      if (meta.created_on) lines.push(`创建时间: ${meta.created_on}`);
      if (meta.logpush !== undefined) lines.push(`日志推送: ${meta.logpush ? "已启用" : "未启用"}`);
      if (meta.compatibility_date) lines.push(`兼容日期: ${meta.compatibility_date}`);

      // 展示绑定信息
      const bindings = meta.bindings ?? [];
      if (bindings.length > 0) {
        lines.push("");
        lines.push(`绑定（共 ${bindings.length} 个）:`);
        for (const b of bindings) {
          lines.push(`  - ${b.type}: ${b.name ?? b.namespace_id ?? ""}`);
        }
      }

      lines.push("");
      lines.push("提示: Worker 脚本内容较长，请使用 list_workers 查看概览或通过 Dashboard 查看源码");

      return lines.join("\n");
    } catch (err: any) {
      return `获取 Worker 信息失败: ${err.message ?? err}`;
    }
  });

  // 列出 Worker 路由
  handlers.set("list_worker_routes", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      const res = await getClient().workers.routes.list({ zone_id: zoneId });
      const routes = res.result ?? [];

      if (routes.length === 0) {
        return "暂无 Worker 路由";
      }

      const lines = routes.map((r: any, i: number) => {
        const script = r.script ?? "（无绑定）";
        return `${i + 1}. ${r.pattern} → ${script}\n   ID: ${r.id}`;
      });

      return `Worker 路由列表（共 ${routes.length} 条）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `列出 Worker 路由失败: ${err.message ?? err}`;
    }
  });

  // 查看 Worker 日志
  handlers.set("get_worker_logs", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const scriptName: string = ctx.args.script_name ?? "";

    try {
      // 注意: Workers Tail API 是实时流式的，此处模拟获取近期日志信息
      // 实际的 tail 是 WebSocket 连接，这里返回提示
      const lines = [
        `Worker: ${scriptName}`,
        `Account: ${accountId}`,
        "",
        "提示: Workers 日志为实时流式输出（Tail），建议通过以下方式查看:",
        "1. Cloudflare Dashboard → Workers → 选择脚本 → Logs",
        "2. 使用 wrangler CLI: wrangler tail " + scriptName,
        "",
        "当前暂不支持在聊天中实时查看流式日志。",
      ];
      return lines.join("\n");
    } catch (err: any) {
      return `获取 Worker 日志失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** Workers Tool 模块 */
export const workersTools: ToolModule = { definitions, createHandlers };
