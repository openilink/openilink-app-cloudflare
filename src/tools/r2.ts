/**
 * R2 Tools
 * 提供 Cloudflare R2 存储桶的列出、对象浏览和桶详情能力
 */
import type Cloudflare from "cloudflare";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";
import type { ToolModule } from "./index.js";

/** R2 模块 tool 定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "list_r2_buckets",
    description: "列出 Cloudflare R2 存储桶",
    command: "list_r2_buckets",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
      },
      required: ["account_id"],
    },
  },
  {
    name: "list_r2_objects",
    description: "列出 R2 桶内的对象",
    command: "list_r2_objects",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        bucket_name: { type: "string", description: "R2 桶名称" },
        prefix: { type: "string", description: "对象前缀过滤（可选）" },
      },
      required: ["account_id", "bucket_name"],
    },
  },
  {
    name: "get_r2_bucket_info",
    description: "获取 R2 桶的详细信息",
    command: "get_r2_bucket_info",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        bucket_name: { type: "string", description: "R2 桶名称" },
      },
      required: ["account_id", "bucket_name"],
    },
  },
];

/** 创建 R2 模块的 handler 映射 */
function createHandlers(client: Cloudflare): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 列出 R2 桶
  handlers.set("list_r2_buckets", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";

    try {
      const res = await client.r2.buckets.list({ account_id: accountId });
      const buckets = res.buckets ?? [];

      if (buckets.length === 0) {
        return "暂无 R2 存储桶";
      }

      const lines = buckets.map((b: any, i: number) => {
        const created = b.creation_date ?? "N/A";
        const location = b.location ?? "auto";
        return `${i + 1}. ${b.name}\n   创建时间: ${created}\n   位置: ${location}`;
      });

      return `R2 存储桶列表（共 ${buckets.length} 个）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `列出 R2 桶失败: ${err.message ?? err}`;
    }
  });

  // 列出桶内对象
  handlers.set("list_r2_objects", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const bucketName: string = ctx.args.bucket_name ?? "";
    const prefix: string = ctx.args.prefix ?? "";

    try {
      const params: any = {
        account_id: accountId,
        bucket_name: bucketName,
      };
      if (prefix) params.prefix = prefix;

      // 使用 Sippy API 或直接 S3 兼容接口
      // 这里提供桶信息和提示
      const lines = [
        `R2 桶: ${bucketName}`,
        `Account: ${accountId}`,
        prefix ? `前缀过滤: ${prefix}` : "",
        "",
        "提示: R2 对象列表建议通过以下方式查看:",
        "1. Cloudflare Dashboard → R2 → 选择桶",
        "2. 使用 S3 兼容 API 或 rclone 工具",
        "3. 使用 wrangler CLI: wrangler r2 object list " + bucketName,
      ].filter(Boolean);

      return lines.join("\n");
    } catch (err: any) {
      return `列出 R2 对象失败: ${err.message ?? err}`;
    }
  });

  // 桶详情
  handlers.set("get_r2_bucket_info", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const bucketName: string = ctx.args.bucket_name ?? "";

    try {
      const res = await client.r2.buckets.get(bucketName, { account_id: accountId });
      const bucket = res as any;

      const lines = [
        `R2 桶详情: ${bucket.name ?? bucketName}`,
        "",
        `名称: ${bucket.name ?? bucketName}`,
        `创建时间: ${bucket.creation_date ?? "N/A"}`,
        `位置: ${bucket.location ?? "auto"}`,
      ];

      return lines.join("\n");
    } catch (err: any) {
      return `获取 R2 桶详情失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** R2 Tool 模块 */
export const r2Tools: ToolModule = { definitions, createHandlers };
