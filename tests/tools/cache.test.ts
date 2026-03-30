/**
 * tools/cache.ts 测试
 * Mock Cloudflare SDK 验证缓存工具的 handler 和定义
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cacheTools } from "../../src/tools/cache.js";
import type { ToolContext } from "../../src/hub/types.js";

/** 创建模拟的 Cloudflare 客户端 */
function createMockClient() {
  return {
    cache: {
      purge: vi.fn().mockResolvedValue({ id: "purge-001" }),
    },
  } as any;
}

/** 创建测试用 ToolContext */
function makeCtx(args: Record<string, any>): ToolContext {
  return {
    installationId: "inst-001",
    botId: "bot-456",
    userId: "user-001",
    traceId: "trace-001",
    args,
  };
}

describe("cacheTools", () => {
  describe("tool definitions 结构", () => {
    it("应包含 2 个缓存相关工具定义", () => {
      const { definitions } = cacheTools;
      expect(definitions).toHaveLength(2);

      const names = definitions.map((d) => d.name);
      expect(names).toContain("purge_cache_all");
      expect(names).toContain("purge_cache_urls");
    });

    it("purge_cache_all 应要求 zone_id 为必填", () => {
      const def = cacheTools.definitions.find((d) => d.name === "purge_cache_all");
      expect(def?.parameters?.required).toContain("zone_id");
    });

    it("purge_cache_urls 应要求 zone_id 和 urls 为必填", () => {
      const def = cacheTools.definitions.find((d) => d.name === "purge_cache_urls");
      expect(def?.parameters?.required).toContain("zone_id");
      expect(def?.parameters?.required).toContain("urls");
    });
  });

  describe("createHandlers", () => {
    let client: ReturnType<typeof createMockClient>;
    let handlers: Map<string, any>;

    beforeEach(() => {
      client = createMockClient();
      handlers = cacheTools.createHandlers(client);
    });

    describe("purge_cache_all", () => {
      it("应成功清除全部缓存", async () => {
        const handler = handlers.get("purge_cache_all")!;
        const result = await handler(makeCtx({ zone_id: "zone-001" }));

        expect(client.cache.purge).toHaveBeenCalledWith({
          zone_id: "zone-001",
          purge_everything: true,
        });
        expect(result).toContain("全部清除");
      });

      it("API 出错时应返回错误消息", async () => {
        client.cache.purge.mockRejectedValueOnce(new Error("Permission denied"));

        const handler = handlers.get("purge_cache_all")!;
        const result = await handler(makeCtx({ zone_id: "zone-001" }));
        expect(result).toContain("清除全部缓存失败");
      });
    });

    describe("purge_cache_urls", () => {
      it("应成功清除指定 URL 缓存", async () => {
        const handler = handlers.get("purge_cache_urls")!;
        const result = await handler(makeCtx({
          zone_id: "zone-001",
          urls: "https://example.com/page1, https://example.com/page2",
        }));

        expect(client.cache.purge).toHaveBeenCalledWith({
          zone_id: "zone-001",
          files: ["https://example.com/page1", "https://example.com/page2"],
        });
        expect(result).toContain("缓存已清除");
        expect(result).toContain("example.com/page1");
      });

      it("空 URL 列表应返回提示", async () => {
        const handler = handlers.get("purge_cache_urls")!;
        const result = await handler(makeCtx({
          zone_id: "zone-001",
          urls: "",
        }));
        expect(result).toContain("至少一个");
      });

      it("API 出错时应返回错误消息", async () => {
        client.cache.purge.mockRejectedValueOnce(new Error("Rate limited"));

        const handler = handlers.get("purge_cache_urls")!;
        const result = await handler(makeCtx({
          zone_id: "zone-001",
          urls: "https://example.com/page1",
        }));
        expect(result).toContain("清除指定 URL 缓存失败");
      });
    });
  });
});
