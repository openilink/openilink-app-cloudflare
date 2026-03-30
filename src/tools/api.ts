/**
 * 通用 Cloudflare API 调用工具
 * 可以调用任意 Cloudflare REST API 端点，覆盖预置工具未支持的操作。
 * 底层直接复用 Cloudflare SDK 的 HTTP 方法，自动携带认证信息。
 */
import type Cloudflare from "cloudflare";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";
import type { ToolModule } from "./index.js";

/** 允许的 HTTP 方法集合 */
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/** 通用 API 工具定义 */
const definitions: ToolDefinition[] = [
  {
    name: "cloudflare_api",
    description:
      "通用 Cloudflare API 调用 — 可以调用任意 Cloudflare REST API 端点。" +
      "适用于当前预置工具未覆盖的操作。传入 HTTP 方法、路径和可选参数即可。" +
      "路径相对于 /client/v4，例如 /zones 或 /accounts/{account_id}/workers/scripts。",
    command: "cloudflare_api",
    parameters: {
      type: "object",
      properties: {
        method: {
          type: "string",
          description: "HTTP 方法：GET / POST / PUT / PATCH / DELETE，默认 GET",
        },
        path: {
          type: "string",
          description:
            "API 路径（相对于 /client/v4），如 /zones、/zones/{zone_id}/dns_records",
        },
        body: {
          type: "string",
          description:
            '请求体 JSON 字符串（POST / PUT / PATCH 时使用），如 {"name":"example.com"}',
        },
        query: {
          type: "string",
          description:
            '查询参数 JSON 字符串（GET 时使用），如 {"per_page":"50","page":"1"}',
        },
      },
      required: ["path"],
    },
  },
];

/** 创建通用 API 工具的 handler 映射 */
function createHandlers(
  getClient: () => Cloudflare,
): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  handlers.set("cloudflare_api", async (ctx) => {
    const method = ((ctx.args.method as string) || "GET").toUpperCase();
    const path = ctx.args.path as string;
    const bodyStr = ctx.args.body as string | undefined;
    const queryStr = ctx.args.query as string | undefined;

    // 校验 HTTP 方法
    if (!ALLOWED_METHODS.has(method)) {
      return `不支持的 HTTP 方法: ${method}，仅支持 GET/POST/PUT/PATCH/DELETE`;
    }

    // 解析可选的请求体
    let body: Record<string, unknown> | undefined;
    if (bodyStr) {
      try {
        body = JSON.parse(bodyStr);
      } catch {
        return `body 参数不是合法的 JSON: ${bodyStr}`;
      }
    }

    // 解析可选的查询参数
    let query: Record<string, unknown> | undefined;
    if (queryStr) {
      try {
        query = JSON.parse(queryStr);
      } catch {
        return `query 参数不是合法的 JSON: ${queryStr}`;
      }
    }

    // 确保路径以 / 开头
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    try {
      const client = getClient();
      const opts: Record<string, unknown> = {};
      if (body && method !== "GET") opts.body = body;
      if (query) opts.query = query;

      // 根据 HTTP 方法调用 SDK 对应的通用方法
      let data: unknown;
      switch (method) {
        case "GET":
          data = await (client as any).get(normalizedPath, opts);
          break;
        case "POST":
          data = await (client as any).post(normalizedPath, opts);
          break;
        case "PUT":
          data = await (client as any).put(normalizedPath, opts);
          break;
        case "PATCH":
          data = await (client as any).patch(normalizedPath, opts);
          break;
        case "DELETE":
          data = await (client as any).delete(normalizedPath, opts);
          break;
      }

      // 格式化输出并限制长度，防止消息过长
      const text = JSON.stringify(data, null, 2);
      if (text.length > 4000) {
        return text.slice(0, 4000) + "\n... (内容已截断，共 " + text.length + " 字符)";
      }
      return text;
    } catch (err: any) {
      return `Cloudflare API 调用失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** 通用 API 工具模块 */
export const apiTools: ToolModule = { definitions, createHandlers };
