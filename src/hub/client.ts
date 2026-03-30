/**
 * Hub Bot API 客户端 - 用于通过 Hub 向微信用户发送消息
 * Bot API 路径前缀: /bot/v1
 */
export class HubClient {
  private hubUrl: string;
  private appToken: string;

  constructor(hubUrl: string, appToken: string) {
    this.hubUrl = hubUrl.replace(/\/+$/, "");
    this.appToken = appToken;
  }

  /**
   * 发送文本消息
   * POST /bot/v1/message/send
   * @param to 目标微信用户 ID
   * @param text 文本内容
   * @param traceId 可选的追踪 ID
   */
  async sendText(to: string, text: string, traceId?: string): Promise<void> {
    const url = `${this.hubUrl}/bot/v1/message/send`;

    const payload: Record<string, string> = {
      to: to,
      type: "text",
      content: text,
    };
    if (traceId) {
      payload.trace_id = traceId;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.appToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `[hub-client] 发送消息失败: ${res.status} ${res.statusText} - ${errText}`,
      );
    }
  }

  /**
   * 同步工具定义到 Hub
   * PUT /bot/v1/app/tools
   */
  async syncTools(tools: import("./types.js").ToolDefinition[]): Promise<void> {
    const url = `${this.hubUrl}/bot/v1/app/tools`;
    const resp = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.appToken}`,
      },
      body: JSON.stringify({ tools }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[hub-client] syncTools 失败 [${resp.status}]: ${errText}`);
    }
  }
}
