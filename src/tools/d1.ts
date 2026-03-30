/**
 * D1 Tools
 * 提供 Cloudflare D1 数据库的列出、详情、查询、创建能力
 */
import type Cloudflare from "cloudflare";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";
import type { ToolModule } from "./index.js";

/** D1 模块 tool 定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "list_d1_databases",
    description: "列出 Cloudflare D1 数据库",
    command: "list_d1_databases",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
      },
      required: ["account_id"],
    },
  },
  {
    name: "get_d1_database",
    description: "获取 D1 数据库详情",
    command: "get_d1_database",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        database_id: { type: "string", description: "D1 数据库 ID" },
      },
      required: ["account_id", "database_id"],
    },
  },
  {
    name: "query_d1",
    description: "在 D1 数据库上执行 SQL 查询",
    command: "query_d1",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        database_id: { type: "string", description: "D1 数据库 ID" },
        sql: { type: "string", description: "要执行的 SQL 语句" },
      },
      required: ["account_id", "database_id", "sql"],
    },
  },
  {
    name: "create_d1_database",
    description: "创建 D1 数据库",
    command: "create_d1_database",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        name: { type: "string", description: "数据库名称" },
      },
      required: ["account_id", "name"],
    },
  },
];

/** 创建 D1 模块的 handler 映射，接收 client 工厂函数实现 per-installation 隔离 */
function createHandlers(getClient: () => Cloudflare): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 列出 D1 数据库
  handlers.set("list_d1_databases", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";

    try {
      const res = await (getClient() as any).d1.database.list({ account_id: accountId });
      const databases = res.result ?? res ?? [];

      if (Array.isArray(databases) && databases.length === 0) {
        return "暂无 D1 数据库";
      }

      const items = Array.isArray(databases) ? databases : [databases];
      const lines = items.map((db: any, i: number) => {
        const created = db.created_at ?? "N/A";
        const version = db.version ?? "N/A";
        return `${i + 1}. ${db.name}\n   ID: ${db.uuid ?? db.id}\n   版本: ${version}\n   创建时间: ${created}`;
      });

      return `D1 数据库列表（共 ${items.length} 个）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `列出 D1 数据库失败: ${err.message ?? err}`;
    }
  });

  // D1 数据库详情
  handlers.set("get_d1_database", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const databaseId: string = ctx.args.database_id ?? "";

    try {
      const res = await (getClient() as any).d1.database.get(databaseId, { account_id: accountId });
      const db = res as any;

      const lines = [
        `D1 数据库详情: ${db.name ?? databaseId}`,
        "",
        `名称: ${db.name ?? "N/A"}`,
        `ID: ${db.uuid ?? db.id ?? databaseId}`,
        `版本: ${db.version ?? "N/A"}`,
        `文件大小: ${db.file_size ? (db.file_size / 1024).toFixed(2) + " KB" : "N/A"}`,
        `表数量: ${db.num_tables ?? "N/A"}`,
        `创建时间: ${db.created_at ?? "N/A"}`,
      ];

      return lines.join("\n");
    } catch (err: any) {
      return `获取 D1 数据库详情失败: ${err.message ?? err}`;
    }
  });

  // 执行 SQL 查询
  handlers.set("query_d1", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const databaseId: string = ctx.args.database_id ?? "";
    const sql: string = ctx.args.sql ?? "";

    try {
      const res = await (getClient() as any).d1.database.query(databaseId, {
        account_id: accountId,
        sql,
      });
      const result = res as any;

      // 查询结果可能是数组（多条语句）或单个对象
      const results = Array.isArray(result) ? result : (result.result ?? [result]);

      const lines = [`SQL 查询结果:`, `语句: ${sql}`, ""];

      for (const r of results) {
        if (r.results && Array.isArray(r.results)) {
          lines.push(`返回 ${r.results.length} 行数据:`);
          // 限制展示前 20 行
          const rows = r.results.slice(0, 20);
          for (const row of rows) {
            lines.push(`  ${JSON.stringify(row)}`);
          }
          if (r.results.length > 20) {
            lines.push(`  ...（还有 ${r.results.length - 20} 行未展示）`);
          }
        } else if (r.success !== undefined) {
          lines.push(`执行成功: ${r.success}`);
          if (r.meta) {
            lines.push(`影响行数: ${r.meta.changes ?? 0}`);
            lines.push(`耗时: ${r.meta.duration ?? "N/A"} ms`);
          }
        }
      }

      return lines.join("\n");
    } catch (err: any) {
      return `执行 SQL 查询失败: ${err.message ?? err}`;
    }
  });

  // 创建 D1 数据库
  handlers.set("create_d1_database", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const name: string = ctx.args.name ?? "";

    try {
      const res = await (getClient() as any).d1.database.create({
        account_id: accountId,
        name,
      });
      const db = res as any;

      return `D1 数据库创建成功!\n名称: ${db.name ?? name}\nID: ${db.uuid ?? db.id ?? "N/A"}\n版本: ${db.version ?? "N/A"}`;
    } catch (err: any) {
      return `创建 D1 数据库失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** D1 Tool 模块 */
export const d1Tools: ToolModule = { definitions, createHandlers };
