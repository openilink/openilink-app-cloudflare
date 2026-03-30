/**
 * Workers Tools
 * 提供 Cloudflare Workers 的列出、详情、路由、日志查看、部署、删除、定时触发器能力
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
  {
    name: "deploy_worker",
    description: "部署 Worker 脚本（上传脚本内容）",
    command: "deploy_worker",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        script_name: { type: "string", description: "Worker 脚本名称" },
        script_content: { type: "string", description: "Worker 脚本源码内容" },
      },
      required: ["account_id", "script_name", "script_content"],
    },
  },
  {
    name: "delete_worker",
    description: "删除指定 Worker 脚本",
    command: "delete_worker",
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
    name: "list_worker_cron_triggers",
    description: "列出 Worker 的定时触发器（Cron Triggers）",
    command: "list_worker_cron_triggers",
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

  // 部署 Worker 脚本
  handlers.set("deploy_worker", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const scriptName: string = ctx.args.script_name ?? "";
    const scriptContent: string = ctx.args.script_content ?? "";

    try {
      // scripts.update 需要 multipart/form-data，SDK 支持直接传字符串 body
      await (getClient() as any).workers.scripts.update(scriptName, {
        account_id: accountId,
        // 以 metadata + body 形式上传脚本
        metadata: { main_module: "worker.js" },
        "worker.js": new Blob([scriptContent], { type: "application/javascript" }),
      });

      return `Worker 脚本部署成功!\n脚本名称: ${scriptName}\n\n提示: 如果部署失败或需要更复杂的配置（绑定、环境变量等），建议使用 wrangler CLI:\n  wrangler deploy`;
    } catch (err: any) {
      // 部署可能因为 SDK 接口变化而失败，给出友好提示
      return [
        `部署 Worker 脚本失败: ${err.message ?? err}`,
        "",
        "建议使用 wrangler CLI 进行部署:",
        `  wrangler deploy --name ${scriptName}`,
        "",
        "或通过 Cloudflare Dashboard → Workers → 选择脚本 → Quick Edit 在线编辑。",
      ].join("\n");
    }
  });

  // 删除 Worker 脚本
  handlers.set("delete_worker", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const scriptName: string = ctx.args.script_name ?? "";

    try {
      await getClient().workers.scripts.delete(scriptName, { account_id: accountId });
      return `Worker 脚本已删除!\n脚本名称: ${scriptName}`;
    } catch (err: any) {
      return `删除 Worker 脚本失败: ${err.message ?? err}`;
    }
  });

  // 列出 Worker 定时触发器
  handlers.set("list_worker_cron_triggers", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const scriptName: string = ctx.args.script_name ?? "";

    try {
      const res = await (getClient() as any).workers.scripts.schedules.get(scriptName, {
        account_id: accountId,
      });
      const schedules = res.schedules ?? res.result ?? [];

      if (Array.isArray(schedules) && schedules.length === 0) {
        return `Worker "${scriptName}" 暂无定时触发器`;
      }

      const items = Array.isArray(schedules) ? schedules : [schedules];
      const lines = items.map((s: any, i: number) => {
        const cron = s.cron ?? "N/A";
        const created = s.created_on ?? "N/A";
        return `${i + 1}. ${cron}\n   创建时间: ${created}`;
      });

      return `Worker "${scriptName}" 定时触发器（共 ${items.length} 个）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `列出定时触发器失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** Workers Tool 模块 */
export const workersTools: ToolModule = { definitions, createHandlers };
