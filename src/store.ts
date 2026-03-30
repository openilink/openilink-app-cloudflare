import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Installation } from "./hub/types.js";
import { encryptConfig, decryptConfig } from "./utils/config-crypto.js";

/**
 * SQLite 存储层 - 管理安装凭证
 */
export class Store {
  private db: Database.Database;

  constructor(dbPath: string) {
    // 确保目录存在
    const dir = dirname(dbPath);
    if (dir && dir !== ".") mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS installations (
        id TEXT PRIMARY KEY,
        hub_url TEXT NOT NULL,
        app_id TEXT NOT NULL,
        bot_id TEXT NOT NULL,
        app_token TEXT NOT NULL,
        webhook_secret TEXT NOT NULL,
        config TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // 兼容旧表：如果 config 列不存在则添加
    try {
      this.db.exec(`ALTER TABLE installations ADD COLUMN config TEXT DEFAULT '{}'`);
    } catch {
      // 列已存在，忽略
    }

    // 兼容旧库：为 installations 表添加 encrypted_config 列
    try {
      this.db.exec(`ALTER TABLE installations ADD COLUMN encrypted_config TEXT NOT NULL DEFAULT ''`);
    } catch {
      // 列已存在则忽略
    }
  }

  // ─── 安装管理 ───

  saveInstallation(inst: Installation): void {
    const configJson = JSON.stringify(inst.config ?? {});
    this.db
      .prepare(
        `INSERT OR REPLACE INTO installations
         (id, hub_url, app_id, bot_id, app_token, webhook_secret, config, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(inst.id, inst.hubUrl, inst.appId, inst.botId, inst.appToken, inst.webhookSecret, configJson);
  }

  getInstallation(id: string): Installation | undefined {
    const row = this.db
      .prepare("SELECT * FROM installations WHERE id = ?")
      .get(id) as any;
    if (!row) return undefined;

    // 解析 config JSON，兼容旧数据
    let config: Record<string, string> = {};
    try {
      config = row.config ? JSON.parse(row.config) : {};
    } catch {
      config = {};
    }

    return {
      id: row.id,
      hubUrl: row.hub_url,
      appId: row.app_id,
      botId: row.bot_id,
      appToken: row.app_token,
      webhookSecret: row.webhook_secret,
      createdAt: row.created_at,
      config,
    };
  }

  getAllInstallations(): Installation[] {
    const rows = this.db.prepare("SELECT * FROM installations").all() as any[];
    return rows.map((row) => {
      // 解析 config JSON，兼容旧数据
      let config: Record<string, string> = {};
      try {
        config = row.config ? JSON.parse(row.config) : {};
      } catch {
        config = {};
      }
      return {
        id: row.id,
        hubUrl: row.hub_url,
        appId: row.app_id,
        botId: row.bot_id,
        appToken: row.app_token,
        webhookSecret: row.webhook_secret,
        createdAt: row.created_at,
        config,
      };
    });
  }

  // ─── 用户配置（加密存储）───

  /** 保存用户配置（AES-256-GCM 加密后存储） */
  saveEncryptedConfig(installationId: string, config: Record<string, string>): void {
    const encrypted = encryptConfig(JSON.stringify(config));
    this.db
      .prepare(`UPDATE installations SET encrypted_config = ? WHERE id = ?`)
      .run(encrypted, installationId);
  }

  /** 读取用户配置（从本地解密） */
  getDecryptedConfig(installationId: string): Record<string, string> {
    const row = this.db
      .prepare("SELECT encrypted_config FROM installations WHERE id = ?")
      .get(installationId) as { encrypted_config?: string } | undefined;
    if (!row?.encrypted_config) return {};
    try {
      return JSON.parse(decryptConfig(row.encrypted_config)) as Record<string, string>;
    } catch {
      return {};
    }
  }

  close(): void {
    this.db.close();
  }
}
