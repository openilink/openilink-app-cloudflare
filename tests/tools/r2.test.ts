/**
 * tools/r2.ts 测试
 * Mock Cloudflare SDK 验证 R2 工具的 handler 和定义
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { r2Tools } from "../../src/tools/r2.js";
import type { ToolContext } from "../../src/hub/types.js";

/** 创建模拟的 Cloudflare 客户端 */
function createMockClient() {
  return {
    r2: {
      buckets: {
        list: vi.fn().mockResolvedValue({
          buckets: [
            { name: "my-bucket", creation_date: "2024-01-01T00:00:00Z", location: "WNAM" },
            { name: "assets", creation_date: "2024-03-01T00:00:00Z", location: "auto" },
          ],
        }),
        get: vi.fn().mockResolvedValue({
          name: "my-bucket",
          creation_date: "2024-01-01T00:00:00Z",
          location: "WNAM",
        }),
      },
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

describe("r2Tools", () => {
  describe("tool definitions 结构", () => {
    it("应包含 3 个 R2 相关工具定义", () => {
      expect(r2Tools.definitions).toHaveLength(3);
      const names = r2Tools.definitions.map((d) => d.name);
      expect(names).toContain("list_r2_buckets");
      expect(names).toContain("list_r2_objects");
      expect(names).toContain("get_r2_bucket_info");
    });
  });

  describe("createHandlers", () => {
    let client: ReturnType<typeof createMockClient>;
    let handlers: Map<string, any>;

    beforeEach(() => {
      client = createMockClient();
      handlers = r2Tools.createHandlers(client);
    });

    describe("list_r2_buckets", () => {
      it("应返回格式化的桶列表", async () => {
        const handler = handlers.get("list_r2_buckets")!;
        const result = await handler(makeCtx({ account_id: "acc-001" }));

        expect(result).toContain("R2 存储桶列表");
        expect(result).toContain("my-bucket");
        expect(result).toContain("assets");
      });

      it("无桶时应返回提示", async () => {
        client.r2.buckets.list.mockResolvedValueOnce({ buckets: [] });
        const handler = handlers.get("list_r2_buckets")!;
        const result = await handler(makeCtx({ account_id: "acc-001" }));
        expect(result).toContain("暂无");
      });
    });

    describe("get_r2_bucket_info", () => {
      it("应返回桶详情", async () => {
        const handler = handlers.get("get_r2_bucket_info")!;
        const result = await handler(makeCtx({ account_id: "acc-001", bucket_name: "my-bucket" }));

        expect(result).toContain("my-bucket");
        expect(result).toContain("WNAM");
      });

      it("API 出错时应返回错误消息", async () => {
        client.r2.buckets.get.mockRejectedValueOnce(new Error("Not Found"));
        const handler = handlers.get("get_r2_bucket_info")!;
        const result = await handler(makeCtx({ account_id: "acc-001", bucket_name: "no-exist" }));
        expect(result).toContain("获取 R2 桶详情失败");
      });
    });
  });
});
