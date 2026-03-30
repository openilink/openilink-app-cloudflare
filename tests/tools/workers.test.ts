/**
 * tools/workers.ts 测试
 * Mock Cloudflare SDK 验证 Workers 工具的 handler 和定义
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { workersTools } from "../../src/tools/workers.js";
import type { ToolContext } from "../../src/hub/types.js";

/** 创建模拟的 Cloudflare 客户端 */
function createMockClient() {
  return {
    workers: {
      scripts: {
        list: vi.fn().mockResolvedValue({
          result: [
            { id: "my-worker", modified_on: "2024-06-01T00:00:00Z" },
            { id: "api-proxy", modified_on: "2024-05-01T00:00:00Z" },
          ],
        }),
        get: vi.fn().mockResolvedValue({
          id: "my-worker",
          modified_on: "2024-06-01T00:00:00Z",
          created_on: "2024-01-01T00:00:00Z",
          etag: "abc123",
        }),
      },
      routes: {
        list: vi.fn().mockResolvedValue({
          result: [
            { id: "route-001", pattern: "example.com/api/*", script: "my-worker" },
          ],
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

describe("workersTools", () => {
  describe("tool definitions 结构", () => {
    it("应包含 4 个 Workers 相关工具定义", () => {
      expect(workersTools.definitions).toHaveLength(4);
      const names = workersTools.definitions.map((d) => d.name);
      expect(names).toContain("list_workers");
      expect(names).toContain("get_worker_info");
      expect(names).toContain("list_worker_routes");
      expect(names).toContain("get_worker_logs");
    });
  });

  describe("createHandlers", () => {
    let client: ReturnType<typeof createMockClient>;
    let handlers: Map<string, any>;

    beforeEach(() => {
      client = createMockClient();
      handlers = workersTools.createHandlers(client);
    });

    describe("list_workers", () => {
      it("应返回格式化的 Workers 列表", async () => {
        const handler = handlers.get("list_workers")!;
        const result = await handler(makeCtx({ account_id: "acc-001" }));

        expect(result).toContain("Workers 列表");
        expect(result).toContain("my-worker");
        expect(result).toContain("api-proxy");
      });

      it("无 Workers 时应返回提示", async () => {
        client.workers.scripts.list.mockResolvedValueOnce({ result: [] });
        const handler = handlers.get("list_workers")!;
        const result = await handler(makeCtx({ account_id: "acc-001" }));
        expect(result).toContain("暂无");
      });
    });

    describe("get_worker_info", () => {
      it("应返回 Worker 详情", async () => {
        const handler = handlers.get("get_worker_info")!;
        const result = await handler(makeCtx({ account_id: "acc-001", script_name: "my-worker" }));

        expect(result).toContain("my-worker");
        expect(result).toContain("acc-001");
      });
    });

    describe("list_worker_routes", () => {
      it("应返回 Worker 路由列表", async () => {
        const handler = handlers.get("list_worker_routes")!;
        const result = await handler(makeCtx({ zone_id: "zone-001" }));

        expect(result).toContain("路由列表");
        expect(result).toContain("example.com/api/*");
        expect(result).toContain("my-worker");
      });
    });

    describe("get_worker_logs", () => {
      it("应返回日志提示信息", async () => {
        const handler = handlers.get("get_worker_logs")!;
        const result = await handler(makeCtx({ account_id: "acc-001", script_name: "my-worker" }));

        expect(result).toContain("my-worker");
        expect(result).toContain("wrangler");
      });
    });
  });
});
