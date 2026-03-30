/**
 * hub/webhook.ts 测试
 * 模拟 HTTP 请求验证 Webhook 处理逻辑
 */
import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleWebhook, type CommandHandler } from "../../src/hub/webhook.js";
import type { Installation } from "../../src/hub/types.js";
import type { HubClient } from "../../src/hub/client.js";

/**
 * 创建模拟的 IncomingMessage
 */
function createMockReq(body: string, headers: Record<string, string> = {}): IncomingMessage {
  const readable = new Readable({
    read() {
      this.push(Buffer.from(body));
      this.push(null);
    },
  });
  (readable as any).headers = headers;
  (readable as any).url = "/webhook";
  return readable as unknown as IncomingMessage;
}

/**
 * 创建模拟的 ServerResponse，捕获状态码和响应体
 */
function createMockRes(): ServerResponse & { _statusCode: number; _body: string } {
  const res: any = {
    _statusCode: 0,
    _body: "",
    _headers: {} as Record<string, string>,
    writeHead(code: number, headers?: Record<string, string>) {
      res._statusCode = code;
      if (headers) res._headers = headers;
    },
    end(data?: string) {
      res._body = data ?? "";
    },
  };
  return res;
}

/** 创建模拟的 Store */
function createMockStore(installation?: Installation) {
  return {
    getInstallation: vi.fn().mockReturnValue(installation),
    saveInstallation: vi.fn(),
    getAllInstallations: vi.fn().mockReturnValue(installation ? [installation] : []),
    close: vi.fn(),
  } as any;
}

/** 创建模拟的 HubClient */
function createMockHubClient() {
  return {
    sendText: vi.fn().mockResolvedValue(undefined),
    syncTools: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  } as unknown as HubClient;
}

/** 计算正确签名 */
function computeSignature(secret: string, timestamp: string, body: Buffer): string {
  const mac = createHmac("sha256", secret);
  mac.update(timestamp + ":");
  mac.update(body);
  return "sha256=" + mac.digest("hex");
}

describe("handleWebhook", () => {
  const testInstallation: Installation = {
    id: "inst-001",
    hubUrl: "http://hub.test",
    appId: "cloudflare",
    botId: "bot-456",
    appToken: "token-xyz",
    webhookSecret: "test-secret",
    createdAt: new Date().toISOString(),
  };

  describe("url_verification 事件", () => {
    it("应直接返回 challenge", async () => {
      const body = JSON.stringify({
        v: 1,
        type: "url_verification",
        challenge: "test-challenge-string",
      });
      const req = createMockReq(body);
      const res = createMockRes();
      const store = createMockStore();
      const onCommand = vi.fn();

      await handleWebhook(req, res, {
        store,
        onCommand,
        getHubClient: () => createMockHubClient(),
      });

      expect(res._statusCode).toBe(200);
      const parsed = JSON.parse(res._body);
      expect(parsed.challenge).toBe("test-challenge-string");
      expect(onCommand).not.toHaveBeenCalled();
    });
  });

  describe("签名验证", () => {
    it("签名验证成功时应调用 onCommand", async () => {
      const bodyObj = {
        v: 1,
        type: "event",
        trace_id: "trace-001",
        installation_id: "inst-001",
        bot: { id: "bot-456" },
        event: { type: "command", id: "evt-001", timestamp: 1700000000, data: {} },
      };
      const bodyStr = JSON.stringify(bodyObj);
      const bodyBuf = Buffer.from(bodyStr);
      const timestamp = "1700000000";
      const signature = computeSignature("test-secret", timestamp, bodyBuf);

      const req = createMockReq(bodyStr, {
        "x-timestamp": timestamp,
        "x-signature": signature,
      });
      const res = createMockRes();
      const store = createMockStore(testInstallation);
      const onCommand: CommandHandler = vi.fn().mockResolvedValue("ok");

      await handleWebhook(req, res, {
        store,
        onCommand,
        getHubClient: () => createMockHubClient(),
      });

      expect(res._statusCode).toBe(200);
      expect(onCommand).toHaveBeenCalledOnce();
      const [receivedEvent, receivedInst] = (onCommand as any).mock.calls[0];
      expect(receivedEvent.installation_id).toBe("inst-001");
      expect(receivedInst.id).toBe("inst-001");
    });

    it("签名验证失败时应返回 401", async () => {
      const bodyObj = {
        v: 1,
        type: "event",
        trace_id: "trace-001",
        installation_id: "inst-001",
        bot: { id: "bot-456" },
        event: { type: "command", id: "evt-001", timestamp: 1700000000, data: {} },
      };
      const bodyStr = JSON.stringify(bodyObj);

      const req = createMockReq(bodyStr, {
        "x-timestamp": "1700000000",
        "x-signature": "sha256=invalid-signature-value-that-is-definitely-wrong!!",
      });
      const res = createMockRes();
      const store = createMockStore(testInstallation);
      const onCommand = vi.fn();

      await handleWebhook(req, res, {
        store,
        onCommand,
        getHubClient: () => createMockHubClient(),
      });

      expect(res._statusCode).toBe(401);
      expect(onCommand).not.toHaveBeenCalled();
    });

    it("缺少签名头时应返回 401", async () => {
      const bodyObj = {
        v: 1,
        type: "event",
        trace_id: "trace-001",
        installation_id: "inst-001",
        bot: { id: "bot-456" },
        event: { type: "command", id: "evt-001", timestamp: 1700000000, data: {} },
      };
      const bodyStr = JSON.stringify(bodyObj);

      const req = createMockReq(bodyStr);
      const res = createMockRes();
      const store = createMockStore(testInstallation);
      const onCommand = vi.fn();

      await handleWebhook(req, res, {
        store,
        onCommand,
        getHubClient: () => createMockHubClient(),
      });

      expect(res._statusCode).toBe(401);
      expect(onCommand).not.toHaveBeenCalled();
    });
  });

  describe("安装记录查找", () => {
    it("找不到 installation 时应返回 404", async () => {
      const bodyObj = {
        v: 1,
        type: "event",
        trace_id: "trace-001",
        installation_id: "non-existent",
        bot: { id: "bot-456" },
        event: { type: "command", id: "evt-001", timestamp: 1700000000, data: {} },
      };
      const bodyStr = JSON.stringify(bodyObj);

      const req = createMockReq(bodyStr, {
        "x-timestamp": "1700000000",
        "x-signature": "sha256=something",
      });
      const res = createMockRes();
      const store = createMockStore(undefined);
      const onCommand = vi.fn();

      await handleWebhook(req, res, {
        store,
        onCommand,
        getHubClient: () => createMockHubClient(),
      });

      expect(res._statusCode).toBe(404);
      const parsed = JSON.parse(res._body);
      expect(parsed.error).toContain("安装记录不存在");
      expect(onCommand).not.toHaveBeenCalled();
    });

    it("缺少 installation_id 时应返回 400", async () => {
      const bodyObj = {
        v: 1,
        type: "event",
        trace_id: "trace-001",
        installation_id: "",
        bot: { id: "bot-456" },
        event: { type: "command", id: "evt-001", timestamp: 1700000000, data: {} },
      };
      const bodyStr = JSON.stringify(bodyObj);

      const req = createMockReq(bodyStr, {
        "x-timestamp": "1700000000",
        "x-signature": "sha256=something",
      });
      const res = createMockRes();
      const store = createMockStore();
      const onCommand = vi.fn();

      await handleWebhook(req, res, {
        store,
        onCommand,
        getHubClient: () => createMockHubClient(),
      });

      expect(res._statusCode).toBe(400);
    });
  });

  describe("异常处理", () => {
    it("无效 JSON 请求体应返回 400", async () => {
      const req = createMockReq("not-valid-json{{{");
      const res = createMockRes();
      const store = createMockStore();
      const onCommand = vi.fn();

      await handleWebhook(req, res, {
        store,
        onCommand,
        getHubClient: () => createMockHubClient(),
      });

      expect(res._statusCode).toBe(400);
      const parsed = JSON.parse(res._body);
      expect(parsed.error).toContain("JSON");
    });
  });
});
