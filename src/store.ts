import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Installation } from "./hub/types.js";

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
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  // ─── 安装管理 ───

  saveInstallation(inst: Installation): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO installations
         (id, hub_url, app_id, bot_id, app_token, webhook_secret, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(inst.id, inst.hubUrl, inst.appId, inst.botId, inst.appToken, inst.webhookSecret);
  }

  getInstallation(id: string): Installation | undefined {
    const row = this.db
      .prepare("SELECT * FROM installations WHERE id = ?")
      .get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      hubUrl: row.hub_url,
      appId: row.app_id,
      botId: row.bot_id,
      appToken: row.app_token,
      webhookSecret: row.webhook_secret,
      createdAt: row.created_at,
    };
  }

  getAllInstallations(): Installation[] {
    const rows = this.db.prepare("SELECT * FROM installations").all() as any[];
    return rows.map((row) => ({
      id: row.id,
      hubUrl: row.hub_url,
      appId: row.app_id,
      botId: row.bot_id,
      appToken: row.app_token,
      webhookSecret: row.webhook_secret,
      createdAt: row.created_at,
    }));
  }

  close(): void {
    this.db.close();
  }
}
