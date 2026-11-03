# SevenKitchen 环境与账号交接清单

更新日期：2026-04-28

## 使用原则

这份文档只记录需要交接的资料类型、存放位置、验证方式和责任边界，不记录真实密码、密钥、Token、数据库连接串或私钥内容。

真实敏感信息请通过密码管理器、企业微信私密会话、加密文件或当面交接完成。不要把密钥复制到普通聊天、Git 文档、截图或邮件正文里。

## 交接前必须处理的安全事项

- `docs/COS_AVATAR_CONFIG.md` 中存在历史 COS 明文凭证记录。交接前请在腾讯云 CAM 中轮换对应 COS 访问密钥，并确认生产服务器 `.env` 已更新为新密钥。
- `backend/.env`、`backend/.env.production`、`backend/.env.development`、`backend/.env.bak`、`admin-web/.env.production`、`admin-web/.env.development` 都属于环境配置文件。交接时只交接真实值，不要再次提交到 Git。
- 生产 SSH 私钥 `~/.ssh/claude_deploy` 需要单独交接或重新为新同事生成一把新部署密钥。推荐新增同事自己的 SSH key，而不是多人共用旧私钥。
- 生产数据库交接前建议先做一次备份，并把备份位置和恢复方式一起交接。

## 交接资料总表

| 类别 | 必须交接内容 | 当前线索/位置 | 建议交接方式 | 完成 |
|---|---|---|---|---|
| 代码仓库 | Git 仓库地址、分支策略、部署分支、访问权限 | 当前主分支：`main` | 邀请 Git 账号并确认可 pull/push | [ ] |
| 生产服务器 | 腾讯云 Lighthouse 控制台权限、服务器 IP、SSH 用户、SSH key | `1.14.3.2`，`root`，`~/.ssh/claude_deploy` | 新增同事 SSH 公钥或安全交接私钥 | [ ] |
| 后端生产环境 | `backend/.env.production` 中所有真实变量 | `backend/.env.production` | 密码管理器或加密文件 | [ ] |
| 后端开发环境 | `backend/.env.development`、本地数据库连接方式 | `backend/.env.development`、`backend/docker-compose.yml` | 文档 + 本地演示 | [ ] |
| 生产数据库 | PostgreSQL 地址、端口、库名、用户名、密码、备份/恢复方式 | `DATABASE_URL` | 密码管理器，另附备份位置 | [ ] |
| 腾讯云 COS/CDN | CAM 子账号、SecretId/SecretKey、Bucket、Region、CDN 域名 | COS 环境变量、`img.sevenkitchen.cloud` | 轮换后交接新密钥 | [ ] |
| 微信小程序 | 小程序后台管理员权限、AppID、AppSecret、合法域名、体验版/发布流程 | `WECHAT_APP_ID`、`WECHAT_APP_SECRET` | 微信公众平台授权 + 密码管理器 | [ ] |
| 域名与证书 | `api.sevenkitchen.cloud`、`img.sevenkitchen.cloud`、DNS/CDN/证书管理权限 | 部署和 COS 文档 | 腾讯云账号授权 | [ ] |
| 管理后台 | 管理后台访问地址、登录账号、权限说明 | `admin-web/`、生产部署脚本 | 单独发送账号初始密码或重置 | [ ] |
| 生产运维 | systemd 服务名、日志查看方式、部署脚本、回滚策略 | `sevenkitchen-backend`、部署脚本 | 现场演示一次部署和日志排查 | [ ] |

## 生产服务器

需要交接：

- 腾讯云 Lighthouse 控制台登录权限。
- 服务器 IP：`1.14.3.2`。
- SSH 用户：`root`。
- SSH key 路径约定：`~/.ssh/claude_deploy`。
- 远端后端项目路径：`/opt/sevenkitchen/SevenKitchen/backend`。
- 远端管理后台路径：`/opt/sevenkitchen/SevenKitchen/admin-web`。
- 后端服务名：`sevenkitchen-backend`。

验证方式：

```bash
ssh -i ~/.ssh/claude_deploy root@1.14.3.2
systemctl status sevenkitchen-backend
journalctl -u sevenkitchen-backend -f
```

推荐做法：

- 给新同事新增自己的 SSH key。
- 限制部署 key 权限，只用于本项目。
- 交接后确认旧 key 是否需要保留、禁用或轮换。

## 后端环境变量

来源文件：

- `backend/.env`
- `backend/.env.development`
- `backend/.env.production`
- `backend/.env.example`

必须单独交接的变量：

| 变量 | 用途 | 是否敏感 | 备注 |
|---|---|---|---|
| `PORT` | 后端监听端口 | 否 | 本地和生产可能不同 |
| `DATABASE_URL` | PostgreSQL 连接串 | 是 | 包含数据库账号密码 |
| `JWT_SECRET` | 登录 Token 签名密钥 | 是 | 生产必须使用强随机值 |
| `JWT_EXPIRES_IN` | Token 有效期 | 否 | 例如 7 天 |
| `WECHAT_APP_ID` | 微信小程序 AppID | 半敏感 | 与小程序后台绑定 |
| `WECHAT_APP_SECRET` | 微信小程序 AppSecret | 是 | 需要单独保管 |
| `COS_SECRET_ID` | 腾讯云 COS SecretId | 是 | 建议交接时轮换 |
| `COS_SECRET_KEY` | 腾讯云 COS SecretKey | 是 | 建议交接时轮换 |
| `COS_BUCKET` | COS 存储桶 | 否 | 当前线索：`sevenkitchen-mvp-123-1392823718` |
| `COS_REGION` | COS 地域 | 否 | 当前线索：`ap-chengdu` |
| `COS_CDN_DOMAIN` | 图片 CDN 域名 | 否 | 当前线索：`img.sevenkitchen.cloud` |
| `DOG_REPO` | 狗狗模块仓储模式 | 否 | 常见值：`memory` 或 `prisma` |
| `ADDRESS_REPO` | 地址模块仓储模式 | 否 | 常见值：`memory` 或 `prisma` |
| `ORDER_REPO` | 订单模块仓储模式 | 否 | 常见值：`memory` 或 `prisma` |
| `RECIPE_REPO` | 食谱模块仓储模式 | 否 | 常见值：`memory` 或 `prisma` |

验证方式：

```bash
cd backend
bash scripts/verify_env.sh
npm run start:check
```

## 数据库

需要交接：

- 本地开发数据库启动方式。
- 生产 PostgreSQL 连接信息。
- 数据库备份文件位置。
- 生产迁移执行规范。
- 发生迁移失败时的回滚负责人和处理方式。

当前线索：

- 本地 Docker 数据库配置见 `backend/docker-compose.yml`。
- Prisma schema 见 `backend/prisma/schema.prisma`。
- 迁移目录见 `backend/prisma/migrations/`。
- 历史备份文件示例：`backup_sevenkitchen_20260202_005959.sql`。

硬规则：

- 不要直接手改生产数据库结构。
- 数据库结构变更必须通过 Prisma migration。
- 操作数据库前先读 `docs/DATABASE_NAMING_CONVENTIONS.md`。
- 生产迁移前先备份。

## 管理后台环境变量

来源文件：

- `admin-web/.env.development`
- `admin-web/.env.production`

必须交接：

| 变量 | 用途 | 是否敏感 | 备注 |
|---|---|---|---|
| `VITE_API_BASE_URL` | 管理后台 API 地址 | 否 | 生产通常指向 `api.sevenkitchen.cloud` |

部署入口：

```bash
./deploy-admin-web.sh
```

需要单独交接：

- 管理后台线上访问地址。
- 管理员账号。
- 员工账号。
- 各角色权限说明。
- 初始密码重置流程。

## 微信小程序

需要交接：

- 微信公众平台/小程序后台管理员权限。
- 小程序 AppID。
- 小程序 AppSecret。
- 体验版、审核、发布流程。
- 开发者成员管理方式。
- 服务器合法域名配置。

当前必须确认的合法域名：

- request 合法域名：`https://api.sevenkitchen.cloud`
- uploadFile 合法域名：`https://api.sevenkitchen.cloud`
- downloadFile 合法域名：`https://api.sevenkitchen.cloud`
- 图片/CDN 域名：`https://img.sevenkitchen.cloud`

小程序构建后，微信开发者工具打开：

```text
miniapp/dist/dev/mp-weixin
miniapp/dist/build/mp-weixin
```

## 腾讯云 COS 与 CDN

需要交接：

- 腾讯云主账号或被授权的 CAM 子账号。
- COS SecretId。
- COS SecretKey。
- Bucket 名称。
- Region。
- CDN 域名。
- Bucket 权限策略。
- CORS 配置。
- CDN 缓存刷新权限。
- 费用和流量告警接收人。

当前线索：

- Bucket：`sevenkitchen-mvp-123-1392823718`
- Region：`ap-chengdu`
- CDN：`img.sevenkitchen.cloud`
- 相关文档：`TENCENT_COS_SETUP.md`、`docs/COS_SETUP_GUIDE.md`、`docs/COS_BCS_IMAGES_CONFIG.md`

安全要求：

- 交接前轮换历史明文泄露过的 COS 密钥。
- 新同事使用自己的 CAM 子账号。
- 不要将 SecretId/SecretKey 写进项目文档。

## 域名、DNS 与证书

需要交接：

- `sevenkitchen.cloud` 域名注册商账号或管理权限。
- `api.sevenkitchen.cloud` DNS 解析配置。
- `img.sevenkitchen.cloud` DNS/CDN 配置。
- HTTPS 证书申请、续期和安装方式。
- 证书到期提醒接收人。

建议验证：

```bash
curl https://api.sevenkitchen.cloud/api/v1/health
curl https://img.sevenkitchen.cloud/bcs-standards/BCS-chart.png
```

## 部署和运维脚本

后端生产部署：

```bash
bash backend/scripts/remote_deploy_v2.sh
```

管理后台部署：

```bash
./deploy-admin-web.sh
```

相关文档：

- `docs/REMOTE_DEPLOY_GUIDE.md`
- `docs/DEPLOYMENT.md`
- `skills/production-ssh/SKILL.md`

需要现场交接：

- 如何看服务状态。
- 如何看实时日志。
- 如何确认健康接口正常。
- 如何判断部署失败。
- 如何回滚到上一版。

## 交接验收清单

- [ ] 新同事能拉取代码并切到 `main`。
- [ ] 新同事能启动本地后端。
- [ ] 新同事能运行 `backend/scripts/verify_env.sh`。
- [ ] 新同事能连接本地数据库并完成 Prisma generate。
- [ ] 新同事能构建小程序预览包。
- [ ] 新同事能用微信开发者工具打开小程序构建目录。
- [ ] 新同事能访问管理后台开发环境。
- [ ] 新同事拥有生产服务器只读排障能力。
- [ ] 新同事知道生产部署入口，但首次生产部署需由原负责人陪同。
- [ ] COS 密钥已轮换并交接新密钥。
- [ ] 微信小程序后台权限已授权。
- [ ] 数据库备份和恢复流程已演示。
- [ ] 域名、证书、CDN 权限已确认。

## 推荐交接会议安排

1. 代码与模块边界走读：30 分钟。
2. 本地启动后端、管理后台、小程序：30 分钟。
3. 生产服务器、日志、部署脚本走读：30 分钟。
4. 数据库、迁移、备份恢复走读：30 分钟。
5. 腾讯云 COS、微信小程序后台、域名证书权限确认：30 分钟。

## 敏感资料领取记录

| 资料 | 交接人 | 接收人 | 交接方式 | 交接时间 | 备注 |
|---|---|---|---|---|---|
| 生产 SSH 权限 |  |  |  |  |  |
| 生产 `DATABASE_URL` |  |  |  |  |  |
| 生产 `JWT_SECRET` |  |  |  |  |  |
| 微信 AppSecret |  |  |  |  |  |
| COS SecretId/SecretKey |  |  |  |  |  |
| 腾讯云控制台权限 |  |  |  |  |  |
| 微信小程序后台权限 |  |  |  |  |  |
| 域名/DNS/证书权限 |  |  |  |  |  |
| 管理后台管理员账号 |  |  |  |  |  |
