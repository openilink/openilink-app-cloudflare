/**
 * tools/dns.ts 测试
 * Mock Cloudflare SDK 验证 DNS 工具的 handler 和定义
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dnsTools } from "../../src/tools/dns.js";
import type { ToolContext } from "../../src/hub/types.js";

/** 创建模拟的 Cloudflare 客户端 */
function createMockClient() {
  return {
    zones: {
      list: vi.fn().mockResolvedValue({
        result: [
          {
            id: "zone-001",
            name: "example.com",
            status: "active",
            plan: { name: "Free" },
          },
          {
            id: "zone-002",
            name: "test.io",
            status: "pending",
            plan: { name: "Pro" },
          },
        ],
      }),
    },
    dns: {
      records: {
        list: vi.fn().mockResolvedValue({
          result: [
            {
              id: "rec-001",
              type: "A",
              name: "www.example.com",
              content: "1.2.3.4",
              proxied: true,
              ttl: 1,
            },
            {
              id: "rec-002",
              type: "CNAME",
              name: "blog.example.com",
              content: "example.com",
              proxied: false,
              ttl: 3600,
            },
          ],
        }),
        create: vi.fn().mockResolvedValue({
          id: "rec-new",
          type: "A",
          name: "api.example.com",
          content: "5.6.7.8",
        }),
        update: vi.fn().mockResolvedValue({
          id: "rec-001",
          type: "A",
          name: "www.example.com",
          content: "9.8.7.6",
        }),
        delete: vi.fn().mockResolvedValue({
          id: "rec-001",
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

describe("dnsTools", () => {
  describe("tool definitions 结构", () => {
    it("应包含 5 个 DNS 相关工具定义", () => {
      const { definitions } = dnsTools;
      expect(definitions).toHaveLength(5);

      const names = definitions.map((d) => d.name);
      expect(names).toContain("list_zones");
      expect(names).toContain("list_dns_records");
      expect(names).toContain("create_dns_record");
      expect(names).toContain("update_dns_record");
      expect(names).toContain("delete_dns_record");
    });

    it("每个定义应包含 name, description, command 字段", () => {
      for (const def of dnsTools.definitions) {
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.command).toBeTruthy();
      }
    });

    it("list_dns_records 应要求 zone_id 为必填", () => {
      const def = dnsTools.definitions.find((d) => d.name === "list_dns_records");
      expect(def?.parameters?.required).toContain("zone_id");
    });

    it("create_dns_record 应要求 zone_id, type, name, content 为必填", () => {
      const def = dnsTools.definitions.find((d) => d.name === "create_dns_record");
      expect(def?.parameters?.required).toContain("zone_id");
      expect(def?.parameters?.required).toContain("type");
      expect(def?.parameters?.required).toContain("name");
      expect(def?.parameters?.required).toContain("content");
    });
  });

  describe("createHandlers", () => {
    let client: ReturnType<typeof createMockClient>;
    let handlers: Map<string, any>;

    beforeEach(() => {
      client = createMockClient();
      handlers = dnsTools.createHandlers(client);
    });

    it("应创建与 definitions 对应的 handler", () => {
      for (const def of dnsTools.definitions) {
        expect(handlers.has(def.command)).toBe(true);
      }
    });

    describe("list_zones", () => {
      it("应返回格式化的域名列表", async () => {
        const handler = handlers.get("list_zones")!;
        const result = await handler(makeCtx({}));

        expect(client.zones.list).toHaveBeenCalledOnce();
        expect(result).toContain("域名列表");
        expect(result).toContain("example.com");
        expect(result).toContain("test.io");
        expect(result).toContain("活跃");
      });

      it("无域名时应返回提示", async () => {
        client.zones.list.mockResolvedValueOnce({ result: [] });

        const handler = handlers.get("list_zones")!;
        const result = await handler(makeCtx({}));
        expect(result).toContain("暂无域名");
      });

      it("应传递 count 参数", async () => {
        const handler = handlers.get("list_zones")!;
        await handler(makeCtx({ count: 5 }));

        const callArgs = client.zones.list.mock.calls[0][0];
        expect(callArgs.per_page).toBe(5);
      });
    });

    describe("list_dns_records", () => {
      it("应返回格式化的 DNS 记录列表", async () => {
        const handler = handlers.get("list_dns_records")!;
        const result = await handler(makeCtx({ zone_id: "zone-001" }));

        expect(client.dns.records.list).toHaveBeenCalledOnce();
        expect(result).toContain("DNS 记录列表");
        expect(result).toContain("A");
        expect(result).toContain("www.example.com");
        expect(result).toContain("1.2.3.4");
        expect(result).toContain("代理");
      });

      it("无记录时应返回提示", async () => {
        client.dns.records.list.mockResolvedValueOnce({ result: [] });

        const handler = handlers.get("list_dns_records")!;
        const result = await handler(makeCtx({ zone_id: "zone-001" }));
        expect(result).toContain("暂无 DNS 记录");
      });
    });

    describe("create_dns_record", () => {
      it("应成功创建 DNS 记录", async () => {
        const handler = handlers.get("create_dns_record")!;
        const result = await handler(makeCtx({
          zone_id: "zone-001",
          type: "A",
          name: "api.example.com",
          content: "5.6.7.8",
        }));

        expect(client.dns.records.create).toHaveBeenCalledOnce();
        expect(result).toContain("创建成功");
        expect(result).toContain("api.example.com");
      });

      it("API 出错时应返回错误消息", async () => {
        client.dns.records.create.mockRejectedValueOnce(new Error("Forbidden"));

        const handler = handlers.get("create_dns_record")!;
        const result = await handler(makeCtx({
          zone_id: "zone-001",
          type: "A",
          name: "fail.example.com",
          content: "0.0.0.0",
        }));
        expect(result).toContain("创建 DNS 记录失败");
      });
    });

    describe("update_dns_record", () => {
      it("应成功更新 DNS 记录", async () => {
        const handler = handlers.get("update_dns_record")!;
        const result = await handler(makeCtx({
          zone_id: "zone-001",
          record_id: "rec-001",
          type: "A",
          name: "www.example.com",
          content: "9.8.7.6",
        }));

        expect(client.dns.records.update).toHaveBeenCalledOnce();
        expect(result).toContain("更新成功");
      });
    });

    describe("delete_dns_record", () => {
      it("应成功删除 DNS 记录", async () => {
        const handler = handlers.get("delete_dns_record")!;
        const result = await handler(makeCtx({
          zone_id: "zone-001",
          record_id: "rec-001",
        }));

        expect(client.dns.records.delete).toHaveBeenCalledOnce();
        expect(result).toContain("已删除");
        expect(result).toContain("rec-001");
      });

      it("API 出错时应返回错误消息", async () => {
        client.dns.records.delete.mockRejectedValueOnce(new Error("Not Found"));

        const handler = handlers.get("delete_dns_record")!;
        const result = await handler(makeCtx({
          zone_id: "zone-001",
          record_id: "rec-nonexistent",
        }));
        expect(result).toContain("删除 DNS 记录失败");
      });
    });
  });
});
