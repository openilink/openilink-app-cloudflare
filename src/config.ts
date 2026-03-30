/**
 * 应用配置 - 从环境变量加载
 */
export interface Config {
  /** HTTP 监听端口 */
  port: string;
  /** OpeniLink Hub 地址 */
  hubUrl: string;
  /** 本 App 的公网地址 */
  baseUrl: string;
  /** SQLite 数据库路径 */
  dbPath: string;
  /** Cloudflare API Token（可选，云端托管模式下由用户在安装时填写） */
  cloudflareApiToken: string;
  /** Cloudflare Account ID（可选，部分 API 需要） */
  cloudflareAccountId: string;
}

function env(key: string, fallback = ""): string {
  return process.env[key] || fallback;
}

export function loadConfig(): Config {
  const cfg: Config = {
    port: env("PORT", "8099"),
    hubUrl: env("HUB_URL"),
    baseUrl: env("BASE_URL"),
    dbPath: env("DB_PATH", "data/cloudflare.db"),
    cloudflareApiToken: env("CLOUDFLARE_API_TOKEN"),
    cloudflareAccountId: env("CLOUDFLARE_ACCOUNT_ID"),
  };

  // cloudflareApiToken 在云端托管模式下由用户安装时填写，不再强制校验
  const missing: string[] = [];
  if (!cfg.hubUrl) missing.push("HUB_URL");
  if (!cfg.baseUrl) missing.push("BASE_URL");

  if (missing.length > 0) {
    throw new Error(`缺少必填环境变量: ${missing.join(", ")}`);
  }

  return cfg;
}
