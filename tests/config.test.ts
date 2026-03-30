/**
 * config.ts 测试
 * 验证配置加载、默认值和必填项校验
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  /** 保存原始环境变量，测试结束后恢复 */
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 每个测试前清理相关环境变量
    delete process.env.PORT;
    delete process.env.HUB_URL;
    delete process.env.BASE_URL;
    delete process.env.DB_PATH;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = { ...originalEnv };
  });

  it("缺少所有必填项时应抛出错误，并列出全部缺失项", () => {
    expect(() => loadConfig()).toThrowError("缺少必填环境变量: HUB_URL, BASE_URL, CLOUDFLARE_API_TOKEN");
  });

  it("缺少 HUB_URL 时应抛出错误", () => {
    process.env.BASE_URL = "http://app.test";
    process.env.CLOUDFLARE_API_TOKEN = "test-token";
    expect(() => loadConfig()).toThrowError("HUB_URL");
  });

  it("缺少 BASE_URL 时应抛出错误", () => {
    process.env.HUB_URL = "http://hub.test";
    process.env.CLOUDFLARE_API_TOKEN = "test-token";
    expect(() => loadConfig()).toThrowError("BASE_URL");
  });

  it("缺少 CLOUDFLARE_API_TOKEN 时应抛出错误", () => {
    process.env.HUB_URL = "http://hub.test";
    process.env.BASE_URL = "http://app.test";
    expect(() => loadConfig()).toThrowError("CLOUDFLARE_API_TOKEN");
  });

  it("提供所有必填项后应正确加载默认值", () => {
    process.env.HUB_URL = "http://hub.test";
    process.env.BASE_URL = "http://app.test";
    process.env.CLOUDFLARE_API_TOKEN = "test-token";

    const cfg = loadConfig();
    // 验证默认值
    expect(cfg.port).toBe("8099");
    expect(cfg.dbPath).toBe("data/cloudflare.db");
    expect(cfg.baseUrl).toBe("http://app.test");
    expect(cfg.cloudflareAccountId).toBe("");
  });

  it("所有环境变量应正确映射到配置对象", () => {
    process.env.PORT = "3000";
    process.env.HUB_URL = "http://hub.example.com";
    process.env.BASE_URL = "http://app.example.com";
    process.env.DB_PATH = "/tmp/test.db";
    process.env.CLOUDFLARE_API_TOKEN = "cf-token-abc123";
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc-123";

    const cfg = loadConfig();

    expect(cfg.port).toBe("3000");
    expect(cfg.hubUrl).toBe("http://hub.example.com");
    expect(cfg.baseUrl).toBe("http://app.example.com");
    expect(cfg.dbPath).toBe("/tmp/test.db");
    expect(cfg.cloudflareApiToken).toBe("cf-token-abc123");
    expect(cfg.cloudflareAccountId).toBe("acc-123");
  });
});
