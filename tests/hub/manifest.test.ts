/**
 * hub/manifest.ts 测试
 * 验证 Manifest 生成逻辑
 */
import { describe, it, expect } from "vitest";
import { getManifest } from "../../src/hub/manifest.js";
import type { Config } from "../../src/config.js";
import type { ToolDefinition } from "../../src/hub/types.js";

/** 测试用配置 */
const mockConfig: Config = {
  port: "8099",
  hubUrl: "http://hub.test",
  baseUrl: "http://app.example.com",
  dbPath: "data/test.db",
  cloudflareApiToken: "cf-test-token",
  cloudflareAccountId: "",
};

describe("getManifest", () => {
  it("应返回正确的基本结构", () => {
    const manifest = getManifest(mockConfig);

    expect(manifest.slug).toBe("cloudflare");
    expect(manifest.name).toBe("Cloudflare");
    expect(manifest.description).toContain("Cloudflare");
    expect(manifest.icon).toBe("🔶");
  });

  it("应包含正确的事件和权限范围", () => {
    const manifest = getManifest(mockConfig);

    expect(manifest.events).toContain("command");
    expect(manifest.scopes).toContain("tools:write");
  });

  it("应基于 baseUrl 生成正确的 URL", () => {
    const manifest = getManifest(mockConfig);

    expect(manifest.oauth_setup_url).toBe("http://app.example.com/oauth/setup");
    expect(manifest.oauth_redirect_url).toBe("http://app.example.com/oauth/redirect");
    expect(manifest.webhook_url).toBe("http://app.example.com/hub/webhook");
  });

  it("不传 toolDefinitions 时 tools 应为空数组", () => {
    const manifest = getManifest(mockConfig);
    expect(manifest.tools).toEqual([]);
  });

  it("应包含传入的 tool definitions", () => {
    const tools: ToolDefinition[] = [
      {
        name: "test_tool",
        description: "测试工具",
        command: "test_tool",
        parameters: {
          type: "object",
          properties: {
            input: { type: "string", description: "输入参数" },
          },
          required: ["input"],
        },
      },
      {
        name: "another_tool",
        description: "另一个工具",
        command: "another_tool",
      },
    ];

    const manifest = getManifest(mockConfig, tools);
    expect(manifest.tools).toHaveLength(2);
    expect(manifest.tools[0].name).toBe("test_tool");
    expect(manifest.tools[1].name).toBe("another_tool");
    expect(manifest.tools[0].parameters?.required).toEqual(["input"]);
  });

  it("不同 baseUrl 应生成不同的 URL", () => {
    const config2: Config = { ...mockConfig, baseUrl: "https://prod.example.com" };
    const manifest = getManifest(config2);

    expect(manifest.oauth_setup_url).toBe("https://prod.example.com/oauth/setup");
    expect(manifest.webhook_url).toBe("https://prod.example.com/hub/webhook");
  });

  it("config_schema 应包含 cloudflare_api_token 为必填", () => {
    const manifest = getManifest(mockConfig);
    const schema = manifest.config_schema as any;

    expect(schema.properties.cloudflare_api_token).toBeDefined();
    expect(schema.required).toContain("cloudflare_api_token");
  });

  it("应包含安装引导说明", () => {
    const manifest = getManifest(mockConfig);
    expect(manifest.guide).toContain("Cloudflare");
    expect(manifest.guide).toContain("Create Token");
  });
});
