/**
 * Cache Tools
 * 提供 Cloudflare 缓存清理能力（全部清除 / 指定 URL 清除）
 */
import type Cloudflare from "cloudflare";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";
import type { ToolModule } from "./index.js";

/** Cache 模块 tool 定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "purge_cache_all",
    description: "清除指定域名的全部缓存",
    command: "purge_cache_all",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "purge_cache_urls",
    description: "清除指定 URL 的缓存",
    command: "purge_cache_urls",
    parameters: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "域名 Zone ID" },
        urls: { type: "string", description: "要清除缓存的 URL，多个用英文逗号分隔" },
      },
      required: ["zone_id", "urls"],
    },
  },
];

/** 创建 Cache 模块的 handler 映射 */
function createHandlers(client: Cloudflare): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 清除全部缓存
  handlers.set("purge_cache_all", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";

    try {
      await client.cache.purge({
        zone_id: zoneId,
        purge_everything: true,
      });

      return `缓存已全部清除!\nZone ID: ${zoneId}\n\n注意: 缓存清除可能需要几秒钟才能在全球边缘节点生效。`;
    } catch (err: any) {
      return `清除全部缓存失败: ${err.message ?? err}`;
    }
  });

  // 清除指定 URL 缓存
  handlers.set("purge_cache_urls", async (ctx) => {
    const zoneId: string = ctx.args.zone_id ?? "";
    const urlsRaw: string = ctx.args.urls ?? "";

    const urls = urlsRaw
      .split(",")
      .map((u: string) => u.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      return "请提供至少一个要清除缓存的 URL";
    }

    try {
      await client.cache.purge({
        zone_id: zoneId,
        files: urls,
      });

      const urlList = urls.map((u, i) => `${i + 1}. ${u}`).join("\n");
      return `指定 URL 缓存已清除!\nZone ID: ${zoneId}\n\n清除的 URL:\n${urlList}`;
    } catch (err: any) {
      return `清除指定 URL 缓存失败: ${err.message ?? err}`;
    }
  });

  return handlers;
}

/** Cache Tool 模块 */
export const cacheTools: ToolModule = { definitions, createHandlers };
