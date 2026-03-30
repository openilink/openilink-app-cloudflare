/**
 * KV Tools
 * 提供 Cloudflare Workers KV 命名空间和键值的管理能力
 */
import type Cloudflare from "cloudflare";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";
import type { ToolModule } from "./index.js";

/** KV 模块 tool 定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "list_kv_namespaces",
    description: "列出 Cloudflare Workers KV 命名空间",
    command: "list_kv_namespaces",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
      },
      required: ["account_id"],
    },
  },
  {
    name: "create_kv_namespace",
    description: "创建 KV 命名空间",
    command: "create_kv_namespace",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        title: { type: "string", description: "命名空间标题" },
      },
      required: ["account_id", "title"],
    },
  },
  {
    name: "get_kv_value",
    description: "读取 KV 中指定 key 的值",
    command: "get_kv_value",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        namespace_id: { type: "string", description: "KV 命名空间 ID" },
        key: { type: "string", description: "要读取的 Key" },
      },
      required: ["account_id", "namespace_id", "key"],
    },
  },
  {
    name: "put_kv_value",
    description: "写入 KV 键值对",
    command: "put_kv_value",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        namespace_id: { type: "string", description: "KV 命名空间 ID" },
        key: { type: "string", description: "Key 名称" },
        value: { type: "string", description: "要写入的值" },
      },
      required: ["account_id", "namespace_id", "key", "value"],
    },
  },
  {
    name: "delete_kv_value",
    description: "删除 KV 中指定 key",
    command: "delete_kv_value",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        namespace_id: { type: "string", description: "KV 命名空间 ID" },
        key: { type: "string", description: "要删除的 Key" },
      },
      required: ["account_id", "namespace_id", "key"],
    },
  },
];

/** 创建 KV 模块的 handler 映射，接收 client 工厂函数实现 per-installation 隔离 */
function createHandlers(getClient: () => Cloudflare): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 列出 KV 命名空间
  handlers.set("list_kv_namespaces", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";

    try {
      const res = await getClient().kv.namespaces.list({ account_id: accountId });
      const namespaces = res.result ?? [];

      if (Array.isArray(namespaces) && namespaces.length === 0) {
        return "暂无 KV 命名空间";
      }

      const items = Array.isArray(namespaces) ? namespaces : [namespaces];
      const lines = items.map((ns: any, i: number) => {
        return `${i + 1}. ${ns.title}\n   ID: ${ns.id}`;
      });

      return `KV 命名空间列表（共 ${items.length} 个）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `列出 KV 命名空间失败: ${err.message ?? err}`;
    }
  });

  // 创建 KV 命名空间
  handlers.set("create_kv_namespace", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const title: string = ctx.args.title ?? "";

    try {
      const res = await getClient().kv.namespaces.create({
        account_id: accountId,
        title,
      });
      const ns = res as any;

      return `KV 命名空间创建成功!\n标题: ${ns.title ?? title}\nID: ${ns.id ?? "N/A"}`;
    } catch (err: any) {
      return `创建 KV 命名空间失败: ${err.message ?? err}`;
    }
  });

  // 读取 KV 值
  handlers.set("get_kv_value", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const namespaceId: string = ctx.args.namespace_id ?? "";
    const key: string = ctx.args.key ?? "";

    try {
      const res = await (getClient() as any).kv.namespaces.values.get(key, {
        account_id: accountId,
        namespace_id: namespaceId,
      });

      // 值可能是字符串或 Response 对象
      let value: string;
      if (typeof res === "string") {
        value = res;
      } else if (res && typeof res.text === "function") {
        value = await res.text();
      } else {
        value = JSON.stringify(res);
      }

      return `KV 值:\nKey: ${key}\nValue: ${value}`;
    } catch (err: any) {
      return `读取 KV 值失败: ${err.message ?? err}`;
    }
  });

  // 写入 KV 值
  handlers.set("put_kv_value", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const namespaceId: string = ctx.args.namespace_id ?? "";
    const key: string = ctx.args.key ?? "";
    const value: string = ctx.args.value ?? "";

    try {
      await (getClient() as any).kv.namespaces.values.update(key, {
        account_id: accountId,
        namespace_id: namespaceId,
        value,
      });

      return `KV 值写入成功!\nKey: ${key}\nValue: ${value}`;
    } catch (err: any) {
      return `写入 KV 值失败: ${err.message ?? err}`;
    }
  });

  // 删除 KV 值
  handlers.set("delete_kv_value", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const namespaceId: string = ctx.args.namespace_id ?? "";
    const key: string = ctx.args.key ?? "";

    try {
      await (getClient() as any).kv.namespaces.values.delete(key, {
        account_id: accountId,
        namespace_id: namespaceId,
      });

      return `KV 值已删除!\nKey: ${key}`;
    } catch (err: any) {
      return `删除 KV 值失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** KV Tool 模块 */
export const kvTools: ToolModule = { definitions, createHandlers };
