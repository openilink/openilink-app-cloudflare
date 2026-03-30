/**
 * AES-256-GCM 配置加解密工具
 *
 * 用于将从 Hub 拉取的敏感配置（如 cloudflare_api_token）加密后存入本地 SQLite，
 * webhook 处理时再从本地读取并解密，避免明文存储。
 *
 * 密钥派生: 使用 scryptSync 从 passphrase 派生 256 位密钥
 * 加密格式: iv(hex):authTag(hex):ciphertext(hex)
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/** AES-256-GCM 算法标识 */
const ALGO = "aes-256-gcm";

/**
 * 从环境变量读取加密密钥，没有则用默认值（开发模式）
 */
function getKey(): Buffer {
  const passphrase = process.env.CONFIG_ENCRYPT_KEY || "openilink-default-dev-key-change-in-prod";
  return scryptSync(passphrase, "openilink-salt", 32);
}

/**
 * 加密配置明文
 * @param plaintext - 需要加密的明文字符串
 * @returns 格式: iv:authTag:ciphertext（均为 hex 编码）
 */
export function encryptConfig(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return iv.toString("hex") + ":" + tag + ":" + encrypted;
}

/**
 * 解密配置密文
 * @param ciphertext - 格式: iv:authTag:ciphertext（均为 hex 编码）
 * @returns 解密后的明文字符串
 */
export function decryptConfig(ciphertext: string): string {
  const key = getKey();
  const [ivHex, tagHex, encrypted] = ciphertext.split(":");
  if (!ivHex || !tagHex || !encrypted) return "{}";
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
