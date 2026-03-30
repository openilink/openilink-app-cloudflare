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

/** 创建 Workers 模块的 handler 映射 */
function createHandlers(client: Cloudflare): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 列出 Workers
  handlers.set("list_workers", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";

    try {
      const res = await client.workers.scripts.list({ account_id: accountId });
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

  // Worker 详情
  handlers.set("get_worker_info", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const scriptName: string = ctx.args.script_name ?? "";

    try {
      // 通过 settings 获取 Worker 元信息
      const res = await client.workers.scripts.get(scriptName, {
        account_id: accountId,
      });
      const script = res as any;

      const lines = [
        `Worker: ${scriptName}`,
        `Account: ${accountId}`,
      ];

      if (script.modified_on) lines.push(`最后修改: ${script.modified_on}`);
      if (script.created_on) lines.push(`创建时间: ${script.created_on}`);
      if (script.etag) lines.push(`ETag: ${script.etag}`);

      return lines.join("\n");
    } catch (err: any) {
      return `获取 Worker 信息失败: ${err.message ?? err}`;
    }
  });

  // 列出 Worker 路由
  handlers.set("list_worker_routes", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      const res = await client.workers.routes.list({ zone_id: zoneId });
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
