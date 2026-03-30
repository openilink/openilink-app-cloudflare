# OpeniLink Cloudflare App

通过微信管理 Cloudflare -- 20 个 Tools，涵盖 DNS / Workers / R2 / 缓存 / SSL / 防火墙 / 流量统计。

## 功能概览

### DNS 管理 (5 Tools)
- `list_zones` - 列出域名
- `list_dns_records` - 列出 DNS 记录
- `create_dns_record` - 创建 DNS 记录
- `update_dns_record` - 更新 DNS 记录
- `delete_dns_record` - 删除 DNS 记录

### Workers 管理 (4 Tools)
- `list_workers` - 列出 Workers 脚本
- `get_worker_info` - 获取 Worker 详情
- `list_worker_routes` - 列出 Worker 路由
- `get_worker_logs` - 查看 Worker 日志

### 缓存管理 (2 Tools)
- `purge_cache_all` - 清除全部缓存
- `purge_cache_urls` - 清除指定 URL 缓存

### 流量与配置 (2 Tools)
- `get_zone_analytics` - 域名流量统计
- `get_zone_settings` - 域名配置查看

### SSL 证书 (2 Tools)
- `get_ssl_status` - SSL 证书状态
- `list_certificates` - 列出证书

### R2 存储 (3 Tools)
- `list_r2_buckets` - 列出 R2 桶
- `list_r2_objects` - 列出桶内对象
- `get_r2_bucket_info` - 桶详情

### 防火墙 (2 Tools)
- `list_firewall_rules` - 列出防火墙规则
- `get_security_events` - 安全事件

## 快速开始

```bash
# 安装依赖
npm install

# 设置环境变量
export HUB_URL=http://your-hub-url
export BASE_URL=http://your-app-url
export CLOUDFLARE_API_TOKEN=your_api_token

# 开发模式
npm run dev

# 构建并运行
npm run build
npm start
```

## Docker 部署

```bash
docker compose up -d
```

<details>
<summary>自定义部署配置</summary>

### 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `HUB_URL` | 是 | - | OpeniLink Hub 地址 |
| `BASE_URL` | 是 | - | 本 App 公网地址 |
| `CLOUDFLARE_API_TOKEN` | 是 | - | Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | 否 | - | Account ID（Workers/R2 需要） |
| `PORT` | 否 | 8099 | HTTP 监听端口 |
| `DB_PATH` | 否 | data/cloudflare.db | SQLite 数据库路径 |

### 自行构建镜像

```bash
docker build -t openilink-cloudflare .
docker run -d \
  -p 8099:8099 \
  -e HUB_URL=http://your-hub \
  -e BASE_URL=http://your-app \
  -e CLOUDFLARE_API_TOKEN=your_token \
  -v cloudflare-data:/data \
  openilink-cloudflare
```

</details>

## 认证方式

使用 Cloudflare API Token 认证（推荐），或 API Key + Email。

免费额度:
- DNS 记录: 无限制
- Workers: 10 万请求/天
- R2 存储: 10 GB

### 创建 API Token

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 **Create Token**
3. 选择 **Edit zone DNS** 模板（或自定义权限）
4. 根据需要添加 Workers / R2 / Firewall 等权限
5. 复制 Token 并设置为 `CLOUDFLARE_API_TOKEN`

## 使用方式

安装到 Bot 后，支持三种方式调用：

### 自然语言（推荐）

直接用微信跟 Bot 对话，Hub AI 会自动识别意图并调用对应功能：

- "看看我有哪些域名"
- "帮我给 example.com 添加一条 A 记录指向 1.2.3.4"
- "清除 example.com 的全部缓存"
- "查看 Workers 列表"

### 命令调用

也可以使用 `/命令名 参数` 的格式直接调用：

- `/list_zones --count 10`
- `/create_dns_record --zone_id xxx --type A --name www --content 1.2.3.4`

### AI 自动调用

Hub AI 在多轮对话中会自动判断是否需要调用本 App 的功能，无需手动触发。

## 安全与隐私

### 数据处理说明

- **无状态工具**：本 App 为纯工具型应用，请求即响应，**不存储任何用户数据**
- **第三方 API 调用**：您的请求会通过 Cloudflare API 处理，请参阅其隐私政策
- **API Token 安全**：您的 Token 仅存储在服务端环境变量或 Installation 配置中，不会暴露给其他用户

### 应用市场安装（托管模式）

通过 OpeniLink Hub 应用市场安装时，您的请求将通过我们的服务器转发至 Cloudflare API。我们承诺：

- 不会记录、存储或分析您的请求内容和返回结果
- 您的 API Token 加密存储，仅用于调用 Cloudflare 服务
- 所有 App 代码完全开源，接受社区审查

### 自部署（推荐注重隐私的用户）

如果您对数据隐私有更高要求，建议自行部署：

```bash
docker compose up -d
```

自部署后 API Token 和所有请求数据仅在您自己的服务器上。

---

通过 [OpeniLink Hub](https://openilink.com) 连接更多应用。

## License

MIT
