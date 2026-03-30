/**
 * Tool 注册中心
 * 收集所有 tool 模块的定义和 handler，统一注册到 Hub
 *
 * 使用模块级变量 _currentClient 实现 per-installation 凭证隔离：
 * webhook 处理 command 前调用 setCurrentClient()，handler 内部通过 getCurrentClient() 获取
 */
import type Cloudflare from "cloudflare";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";

/** Tool 模块接口 - createHandlers 接收 client 工厂函数 */
export interface ToolModule {
  definitions: ToolDefinition[];
  createHandlers: (getClient: () => Cloudflare) => Map<string, ToolHandler>;
}

// ─── per-request client 隔离 ───

/** 模块级变量：当前请求使用的 Cloudflare client */
let _currentClient: Cloudflare | null = null;

/** 设置当前请求的 Cloudflare client（在 webhook 处理 command 之前调用） */
export function setCurrentClient(client: Cloudflare): void {
  _currentClient = client;
}

/** 获取当前请求的 Cloudflare client（在 handler 内部调用） */
export function getCurrentClient(): Cloudflare {
  if (!_currentClient) {
    throw new Error("Cloudflare client 未初始化，请先调用 setCurrentClient()");
  }
  return _currentClient;
}

// 导入各 tool 模块
import { dnsTools } from "./dns.js";
import { workersTools } from "./workers.js";
import { cacheTools } from "./cache.js";
import { analyticsTools } from "./analytics.js";
import { sslTools } from "./ssl.js";
import { r2Tools } from "./r2.js";
import { firewallTools } from "./firewall.js";

/** 所有 tool 模块列表 */
const modules: ToolModule[] = [
  dnsTools,
  workersTools,
  cacheTools,
  analyticsTools,
  sslTools,
  r2Tools,
  firewallTools,
];

/**
 * 收集所有 tool 的定义和处理函数
 * handler 内部通过 getCurrentClient() 获取当前 installation 的 Cloudflare client
 * @returns definitions: 全部 tool 定义列表, handlers: 命令名 → 处理函数映射
 */
export function collectAllTools(): {
  definitions: ToolDefinition[];
  handlers: Map<string, ToolHandler>;
} {
  const definitions: ToolDefinition[] = [];
  const handlers = new Map<string, ToolHandler>();

  // 传入 getCurrentClient 作为工厂函数，handler 每次调用时获取当前 client
  const getClient = getCurrentClient;

  for (const mod of modules) {
    // 收集定义
    definitions.push(...mod.definitions);

    // 收集处理函数
    const modHandlers = mod.createHandlers(getClient);
    for (const [name, handler] of modHandlers) {
      if (handlers.has(name)) {
        console.warn(`[tools] 工具名称冲突: ${name}，后者将覆盖前者`);
      }
      handlers.set(name, handler);
    }
  }

  console.log(`[tools] 共注册 ${definitions.length} 个工具, ${handlers.size} 个处理函数`);
  return { definitions, handlers };
}
