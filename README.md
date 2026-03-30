# OpeniLink Cloudflare App

通过微信管理 Cloudflare -- 68 个 Tools，全面覆盖 DNS / Workers / R2 / D1 / KV / Tunnels / Pages / 缓存 / SSL / 安全防护 / 流量统计 / 域名设置。

## 功能概览

### DNS 管理 (5 Tools)
- `list_zones` - 列出域名
- `list_dns_records` - 列出 DNS 记录
- `create_dns_record` - 创建 DNS 记录
- `update_dns_record` - 更新 DNS 记录
- `delete_dns_record` - 删除 DNS 记录

### Workers 管理 (10 Tools)
- `list_workers` - 列出 Workers 脚本
- `get_worker_info` - 获取 Worker 详情
- `list_worker_routes` - 列出 Worker 路由
- `get_worker_logs` - 查看 Worker 日志
- `deploy_worker` - 部署 Worker 脚本
- `delete_worker` - 删除 Worker 脚本
- `list_worker_cron_triggers` - 列出定时触发器
- `list_worker_secrets` - 列出 Worker Secrets
- `create_worker_secret` - 创建/更新 Secret
- `delete_worker_secret` - 删除 Secret

### 缓存管理 (2 Tools)
- `purge_cache_all` - 清除全部缓存
- `purge_cache_urls` - 清除指定 URL 缓存

### 流量与分析 (4 Tools)
- `get_zone_analytics` - 域名基本信息
- `get_zone_settings` - 域名配置查看
- `get_traffic_analytics` - 流量分析数据
- `get_web_analytics` - Web Analytics 站点列表

### SSL 证书 (4 Tools)
- `get_ssl_status` - SSL 证书状态
- `list_certificates` - 列出证书
- `order_ssl_certificate` - 订购高级 SSL 证书
- `delete_ssl_certificate` - 删除证书包

### R2 存储 (5 Tools)
- `list_r2_buckets` - 列出 R2 桶
- `list_r2_objects` - 列出桶内对象
- `get_r2_bucket_info` - 桶详情
- `create_r2_bucket` - 创建 R2 桶
- `delete_r2_bucket` - 删除 R2 桶

### 安全防护 (10 Tools)
- `list_firewall_rules` - 列出防火墙规则
- `get_security_events` - 安全事件概览
- `list_waf_rules` - 列出 WAF 规则集
- `create_ip_block` - 封禁 IP
- `delete_ip_block` - 取消 IP 封禁
- `list_rate_limits` - 列出速率限制
- `create_waf_rule` - 创建 WAF 自定义规则
- `update_waf_rule` - 更新 WAF 规则
- `delete_waf_rule` - 删除 WAF 规则

### D1 数据库 (5 Tools)
- `list_d1_databases` - 列出 D1 数据库
- `get_d1_database` - 数据库详情
- `query_d1` - 执行 SQL 查询
- `create_d1_database` - 创建数据库
- `delete_d1_database` - 删除数据库

### KV 存储 (5 Tools)
- `list_kv_namespaces` - 列出 KV 命名空间
- `create_kv_namespace` - 创建命名空间
- `get_kv_value` - 读取 KV 值
- `put_kv_value` - 写入 KV 值
- `delete_kv_value` - 删除 KV 值

### Tunnels 隧道 (6 Tools)
- `list_tunnels` - 列出隧道
- `get_tunnel` - 隧道详情
- `create_tunnel` - 创建隧道
- `delete_tunnel` - 删除隧道
- `get_tunnel_config` - 获取隧道配置
- `update_tunnel_config` - 更新隧道配置

### Pages 托管 (5 Tools)
- `list_pages_projects` - 列出 Pages 项目
- `get_pages_project` - 项目详情
- `list_pages_deployments` - 列出部署记录
- `delete_pages_project` - 删除 Pages 项目
- `retry_pages_deployment` - 重试部署

### 域名设置 (7 Tools)
- `list_zone_settings` - 列出域名所有设置
- `update_zone_setting` - 更新域名设置
- `enable_always_https` - 开启强制 HTTPS
- `set_ssl_mode` - 设置 SSL 模式
- `pause_zone` - 暂停域名
- `resume_zone` - 恢复域名
- `delete_zone` - 删除域名

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
| `CLOUDFLARE_ACCOUNT_ID` | 否 | - | Account ID（Workers/R2/D1 需要） |
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
- D1 数据库: 5 GB
- KV 存储: 1 GB

### 创建 API Token

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 **Create Token**
3. 选择 **Edit zone DNS** 模板（或自定义权限）
4. 根据需要添加 Workers / R2 / Firewall / D1 / Pages / Tunnels 等权限
5. 复制 Token 并设置为 `CLOUDFLARE_API_TOKEN`

## 使用方式

安装到 Bot 后，支持三种方式调用：

### 自然语言（推荐）

直接用微信跟 Bot 对话，Hub AI 会自动识别意图并调用对应功能：

- "看看我有哪些域名"
- "帮我给 example.com 添加一条 A 记录指向 1.2.3.4"
- "清除 example.com 的全部缓存"
- "查看 Workers 列表"
- "封禁 IP 1.2.3.4"
- "创建一个 WAF 规则阻止来自特定国家的请求"
- "暂停 example.com 的 Cloudflare 代理"
- "把 SSL 模式设成 strict"
- "删除 D1 数据库 xxx"
- "查看隧道配置并添加新路由"

### 命令调用

也可以使用 `/命令名 参数` 的格式直接调用：

- `/list_zones --count 10`
- `/create_dns_record --zone_id xxx --type A --name www --content 1.2.3.4`
- `/create_waf_rule --zone_id xxx --expression "ip.src == 1.2.3.4" --action block`

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
