/**
 * Tunnels Tools
 * 提供 Cloudflare Tunnels（零信任隧道）的列出、详情、创建能力
 */
import type Cloudflare from "cloudflare";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";
import type { ToolModule } from "./index.js";

/** Tunnels 模块 tool 定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "list_tunnels",
    description: "列出 Cloudflare Tunnels 隧道",
    command: "list_tunnels",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
      },
      required: ["account_id"],
    },
  },
  {
    name: "get_tunnel",
    description: "获取 Cloudflare Tunnel 隧道详情",
    command: "get_tunnel",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        tunnel_id: { type: "string", description: "隧道 ID" },
      },
      required: ["account_id", "tunnel_id"],
    },
  },
  {
    name: "create_tunnel",
    description: "创建 Cloudflare Tunnel 隧道",
    command: "create_tunnel",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        name: { type: "string", description: "隧道名称" },
      },
      required: ["account_id", "name"],
    },
  },
  {
    name: "delete_tunnel",
    description: "删除 Cloudflare Tunnel 隧道",
    command: "delete_tunnel",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        tunnel_id: { type: "string", description: "隧道 ID" },
      },
      required: ["account_id", "tunnel_id"],
    },
  },
  {
    name: "get_tunnel_config",
    description: "获取隧道的路由配置",
    command: "get_tunnel_config",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        tunnel_id: { type: "string", description: "隧道 ID" },
      },
      required: ["account_id", "tunnel_id"],
    },
  },
  {
    name: "update_tunnel_config",
    description: "更新隧道的路由配置（设置 ingress 规则）",
    command: "update_tunnel_config",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Cloudflare Account ID" },
        tunnel_id: { type: "string", description: "隧道 ID" },
        hostname: { type: "string", description: "公开访问的域名（如 app.example.com）" },
        service: { type: "string", description: "后端服务地址（如 http://localhost:8080）" },
      },
      required: ["account_id", "tunnel_id", "hostname", "service"],
    },
  },
];

/** 创建 Tunnels 模块的 handler 映射，接收 client 工厂函数实现 per-installation 隔离 */
function createHandlers(getClient: () => Cloudflare): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 列出隧道
  handlers.set("list_tunnels", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";

    try {
      // 优先使用 zeroTrust.tunnels，回退到 tunnels
      const client = getClient() as any;
      const api = client.zeroTrust?.tunnels ?? client.tunnels;
      const res = await api.list({ account_id: accountId });
      const tunnels = res.result ?? [];

      if (Array.isArray(tunnels) && tunnels.length === 0) {
        return "暂无 Cloudflare Tunnels 隧道";
      }

      const items = Array.isArray(tunnels) ? tunnels : [tunnels];
      const lines = items.map((t: any, i: number) => {
        const status = t.status ?? "unknown";
        const statusIcon = status === "healthy" ? "✅" : status === "down" ? "❌" : "⏳";
        const created = t.created_at ?? "N/A";
        return `${i + 1}. ${t.name} ${statusIcon} ${status}\n   ID: ${t.id}\n   创建时间: ${created}`;
      });

      return `Tunnels 隧道列表（共 ${items.length} 个）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `列出 Tunnels 失败: ${err.message ?? err}`;
    }
  });

  // 隧道详情
  handlers.set("get_tunnel", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const tunnelId: string = ctx.args.tunnel_id ?? "";

    try {
      const client = getClient() as any;
      const api = client.zeroTrust?.tunnels ?? client.tunnels;
      const res = await api.get(tunnelId, { account_id: accountId });
      const tunnel = res as any;

      const lines = [
        `Tunnel 隧道详情: ${tunnel.name ?? tunnelId}`,
        "",
        `名称: ${tunnel.name ?? "N/A"}`,
        `ID: ${tunnel.id ?? tunnelId}`,
        `状态: ${tunnel.status ?? "unknown"}`,
        `创建时间: ${tunnel.created_at ?? "N/A"}`,
      ];

      // 连接信息
      const conns = tunnel.connections ?? [];
      if (conns.length > 0) {
        lines.push("");
        lines.push(`活跃连接（共 ${conns.length} 个）:`);
        for (const c of conns) {
          const colo = c.colo_name ?? "N/A";
          const clientVer = c.client_version ?? "N/A";
          lines.push(`  - ${colo} | 客户端版本: ${clientVer}`);
        }
      }

      return lines.join("\n");
    } catch (err: any) {
      return `获取 Tunnel 详情失败: ${err.message ?? err}`;
    }
  });

  // 创建隧道
  handlers.set("create_tunnel", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const name: string = ctx.args.name ?? "";

    try {
      const client = getClient() as any;
      const api = client.zeroTrust?.tunnels ?? client.tunnels;
      const res = await api.create({
        account_id: accountId,
        name,
        tunnel_secret: "", // SDK 可能需要此字段，留空让 API 自动生成
      });
      const tunnel = res as any;

      const lines = [
        `Tunnel 隧道创建成功!`,
        `名称: ${tunnel.name ?? name}`,
        `ID: ${tunnel.id ?? "N/A"}`,
      ];

      if (tunnel.token) {
        lines.push(`Token: ${tunnel.token}`);
        lines.push("");
        lines.push("请使用此 Token 在服务器上启动 cloudflared:");
        lines.push(`  cloudflared tunnel run --token ${tunnel.token}`);
      }

      return lines.join("\n");
    } catch (err: any) {
      return `创建 Tunnel 失败: ${err.message ?? err}`;
    }
  });

  // 删除隧道
  handlers.set("delete_tunnel", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const tunnelId: string = ctx.args.tunnel_id ?? "";

    try {
      const client = getClient() as any;
      const api = client.zeroTrust?.tunnels ?? client.tunnels;
      await api.delete(tunnelId, { account_id: accountId });

      return `Tunnel 隧道已删除!\n隧道 ID: ${tunnelId}\n\n注意: 删除前请确保隧道已停止运行，且无活跃连接。`;
    } catch (err: any) {
      return `删除 Tunnel 失败: ${err.message ?? err}`;
    }
  });

  // 获取隧道配置
  handlers.set("get_tunnel_config", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const tunnelId: string = ctx.args.tunnel_id ?? "";

    try {
      const client = getClient() as any;
      const api = client.zeroTrust?.tunnels?.configurations ?? client.tunnels?.configurations;
      const res = await api.get(tunnelId, { account_id: accountId });
      const config = (res as any).config ?? res;

      const lines = [
        `Tunnel 配置（ID: ${tunnelId}）:`,
        "",
      ];

      // 展示 ingress 规则
      const ingress = config?.ingress ?? [];
      if (ingress.length > 0) {
        lines.push(`Ingress 规则（共 ${ingress.length} 条）:`);
        for (const rule of ingress) {
          const hostname = rule.hostname ?? "(catch-all)";
          const service = rule.service ?? "N/A";
          lines.push(`  - ${hostname} -> ${service}`);
        }
      } else {
        lines.push("暂无 Ingress 规则配置");
      }

      return lines.join("\n");
    } catch (err: any) {
      return `获取隧道配置失败: ${err.message ?? err}`;
    }
  });

  // 更新隧道配置（添加 ingress 规则）
  handlers.set("update_tunnel_config", async (ctx) => {
    const accountId: string = ctx.args.account_id ?? "";
    const tunnelId: string = ctx.args.tunnel_id ?? "";
    const hostname: string = ctx.args.hostname ?? "";
    const service: string = ctx.args.service ?? "";

    try {
      const client = getClient() as any;
      const configApi = client.zeroTrust?.tunnels?.configurations ?? client.tunnels?.configurations;

      // 先获取现有配置
      let existingIngress: any[] = [];
      try {
        const existing = await configApi.get(tunnelId, { account_id: accountId });
        const cfg = (existing as any).config ?? existing;
        existingIngress = cfg?.ingress ?? [];
      } catch {
        // 无现有配置，从空开始
      }

      // 移除 catch-all 规则（如果有），后面会重新追加
      const filtered = existingIngress.filter((r: any) => r.hostname);

      // 添加新规则
      filtered.push({ hostname, service });

      // 追加默认 catch-all 规则（必须有）
      filtered.push({ service: "http_status:404" });

      await configApi.update(tunnelId, {
        account_id: accountId,
        config: { ingress: filtered },
      });

      return `隧道配置更新成功!\n隧道 ID: ${tunnelId}\n新增路由: ${hostname} -> ${service}\n\n当前共 ${filtered.length} 条 Ingress 规则（含 catch-all）。`;
    } catch (err: any) {
      return `更新隧道配置失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** Tunnels Tool 模块 */
export const tunnelsTools: ToolModule = { definitions, createHandlers };
