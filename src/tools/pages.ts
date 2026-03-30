/**
 * Pages Tools
 * 提供 Cloudflare Pages 项目和部署的列出、详情查看能力
 */
import type Cloudflare from "cloudflare";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";
import type { ToolModule } from "./index.js";

/** Pages 模块 tool 定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "list_pages_projects",
    description: "列出 Cloudflare Pages 项目",
    command: "list_pages_projects",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
      },
      required: ["account_id"],
    },
  },
  {
    name: "get_pages_project",
    description: "获取 Pages 项目详情",
    command: "get_pages_project",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        project_name: { type: "string", description: "Pages 项目名称" },
      },
      required: ["account_id", "project_name"],
    },
  },
  {
    name: "list_pages_deployments",
    description: "列出 Pages 项目的部署记录",
    command: "list_pages_deployments",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        project_name: { type: "string", description: "Pages 项目名称" },
      },
      required: ["account_id", "project_name"],
    },
  },
];

/** 创建 Pages 模块的 handler 映射，接收 client 工厂函数实现 per-installation 隔离 */
function createHandlers(getClient: () => Cloudflare): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 列出 Pages 项目
  handlers.set("list_pages_projects", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";

    try {
      const client = getClient() as any;
      const res = await client.pages.projects.list({ account_id: accountId });
      const projects = res.result ?? [];

      if (Array.isArray(projects) && projects.length === 0) {
        return "暂无 Pages 项目";
      }

      const items = Array.isArray(projects) ? projects : [projects];
      const lines = items.map((p: any, i: number) => {
        const subdomain = p.subdomain ?? "N/A";
        const created = p.created_on ?? "N/A";
        const env = p.production_branch ?? "main";
        return `${i + 1}. ${p.name}\n   域名: ${subdomain}.pages.dev\n   生产分支: ${env}\n   创建时间: ${created}`;
      });

      return `Pages 项目列表（共 ${items.length} 个）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `列出 Pages 项目失败: ${err.message ?? err}`;
    }
  });

  // Pages 项目详情
  handlers.set("get_pages_project", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const projectName: string = ctx.args.project_name ?? "";

    try {
      const client = getClient() as any;
      const res = await client.pages.projects.get(projectName, { account_id: accountId });
      const project = res as any;

      const lines = [
        `Pages 项目详情: ${project.name ?? projectName}`,
        "",
        `名称: ${project.name ?? projectName}`,
        `域名: ${project.subdomain ?? "N/A"}.pages.dev`,
        `生产分支: ${project.production_branch ?? "N/A"}`,
        `创建时间: ${project.created_on ?? "N/A"}`,
      ];

      // 源代码配置
      const source = project.source;
      if (source) {
        lines.push("");
        lines.push("源代码配置:");
        if (source.type) lines.push(`  类型: ${source.type}`);
        if (source.config?.owner) lines.push(`  仓库所有者: ${source.config.owner}`);
        if (source.config?.repo_name) lines.push(`  仓库名称: ${source.config.repo_name}`);
      }

      // 最近部署信息
      const latest = project.latest_deployment;
      if (latest) {
        lines.push("");
        lines.push("最近部署:");
        lines.push(`  ID: ${latest.id}`);
        lines.push(`  状态: ${latest.latest_stage?.status ?? "N/A"}`);
        lines.push(`  URL: ${latest.url ?? "N/A"}`);
        lines.push(`  部署时间: ${latest.created_on ?? "N/A"}`);
      }

      // 自定义域名
      const domains = project.domains ?? [];
      if (domains.length > 0) {
        lines.push("");
        lines.push(`自定义域名（共 ${domains.length} 个）:`);
        for (const d of domains) {
          lines.push(`  - ${d}`);
        }
      }

      return lines.join("\n");
    } catch (err: any) {
      return `获取 Pages 项目详情失败: ${err.message ?? err}`;
    }
  });

  // 列出 Pages 部署记录
  handlers.set("list_pages_deployments", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const projectName: string = ctx.args.project_name ?? "";

    try {
      const client = getClient() as any;
      const res = await client.pages.projects.deployments.list(projectName, { account_id: accountId });
      const deployments = res.result ?? [];

      if (Array.isArray(deployments) && deployments.length === 0) {
        return "暂无部署记录";
      }

      const items = Array.isArray(deployments) ? deployments : [deployments];
      // 限制展示前 10 条
      const display = items.slice(0, 10);
      const lines = display.map((d: any, i: number) => {
        const status = d.latest_stage?.status ?? "unknown";
        const statusIcon = status === "success" ? "✅" : status === "failure" ? "❌" : "⏳";
        const url = d.url ?? "N/A";
        const created = d.created_on ?? "N/A";
        const env = d.environment ?? "production";
        return `${i + 1}. ${statusIcon} ${status} [${env}]\n   URL: ${url}\n   部署时间: ${created}\n   ID: ${d.id}`;
      });

      let result = `Pages 部署记录（共 ${items.length} 条，展示前 ${display.length} 条）:\n${lines.join("\n")}`;
      if (items.length > 10) {
        result += `\n\n...还有 ${items.length - 10} 条未展示`;
      }

      return result;
    } catch (err: any) {
      return `列出 Pages 部署记录失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** Pages Tool 模块 */
export const pagesTools: ToolModule = { definitions, createHandlers };
