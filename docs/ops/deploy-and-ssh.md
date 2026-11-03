# 生产部署与 SSH

> 状态：2026-11-03 合并整理。本文以**当前脚本**为准；旧文档里的手工 `git pull` / `pkill` 流程已废弃。
> 相关技能：[production-ssh](../../.agents/skills/production-ssh/SKILL.md)。

---

## 1. 环境与入口

| 项 | 值 |
|---|---|
| 生产服务器 | `1.14.3.2`（腾讯云 Lighthouse） |
| SSH 用户 | `root` |
| SSH key | `~/.ssh/claude_deploy`（历史命名，脚本依赖，不要改） |
| 后端目录 | `/opt/sevenkitchen/SevenKitchen/backend` |
| 后台目录 | `/opt/sevenkitchen/SevenKitchen/admin-web` |
| 后端服务 | `systemctl` 的 `sevenkitchen-backend` |
| 对外域名 | 以实际 DNS/Nginx 配置为准（后台/接口不要凭旧文档猜） |

> SSH 公共函数在 `backend/scripts/ssh-helper.sh`：
> `validate_ssh_connection`、`ssh_exec`、`ssh_exec_multiline`、`ssh_upload`、`ssh_download`。
> `validate_ssh_connection` **不接收位置参数**，读 `SERVER_HOST` / `SERVER_USER` / `SSH_KEY_PATH`。

---

## 2. 部署顺序（硬规则）

1. 先把改动合并到 `main`，推到 `origin/main`。
2. 本地自检：后端 `npm test` / 类型检查；后台 `npm run build`。
3. 再部署（脚本从 `origin/main` 构建，分支提交不会被带上）。
4. 部署后报告：部署了哪个提交、健康检查结果。

> 小程序不走这里：小程序只上传体验版，见 `AGENTS.md`。

---

## 3. 后端部署

```bash
# 在仓库根执行（主工作区或任意工位都可，脚本用 origin/main）
bash backend/scripts/remote_deploy_v2.sh
```

脚本做的事：

1. 检查 SSH key 与连接；
2. `git fetch origin/main`，取最新提交；
3. 在临时目录里 `npm ci` + `npm run build`（本地构建，不依赖生产机编译）；
4. 生产机 `git fetch` + `git reset --hard` 到 `origin/main`；
5. 检查 migration 历史、环境变量；
6. 依赖有变化时 `pnpm install --frozen-lockfile`；
7. `prisma migrate deploy`；
8. 上传 `dist/`；
9. `systemctl restart sevenkitchen-backend`；
10. 健康检查 + `post_deploy_verify.sh`。

安全/效率特性：

- 自带 `deploy-backend` 门禁：同一时间只允许一个后端部署。
- 记录上次成功部署的提交；`backend/` 没改动时自动跳过（`--force` 可强制）。
- 生产机不跑 TypeScript 构建，只接收本地构建产物。

---

## 4. 管理后台部署

```bash
# 统一用主工作区这份脚本
bash /Users/zhaochen/Documents/SevenKitchen/deploy-admin-web.sh
```

脚本做的事：

1. `git fetch origin/main`；
2. 把 `origin/main` 导出到临时目录（与当前分支/脏工作区无关）；
3. `npm install` + `npm run build:prod`；
4. `rsync` 到生产后台目录；
5. 验证 `index.html` 存在。

同样自带 `deploy-admin-web` 门禁；`admin-web/` 没改动时自动跳过（`--force` 可强制）。

---

## 5. SSH 操作规范

```bash
# 在仓库根执行
source backend/scripts/ssh-helper.sh
validate_ssh_connection || exit 1

# 单条命令
ssh_exec "systemctl status sevenkitchen-backend"

# 多行命令
ssh_exec_multiline <<'ENDSSH'
systemctl status sevenkitchen-backend --no-pager
journalctl -u sevenkitchen-backend -n 100 --no-pager
ENDSSH
```

常用排查：

```bash
# 服务状态
ssh_exec "systemctl status sevenkitchen-backend --no-pager"

# 最近日志
ssh_exec "journalctl -u sevenkitchen-backend -n 200 --no-pager"

# 实时日志
ssh_exec "journalctl -u sevenkitchen-backend -f"

# 健康检查（端口以生产 .env 的 PORT 为准，常见 3000）
ssh_exec "curl -sf http://127.0.0.1:3000/api/v1/health"
```

**不要**在生产机上手工 `git pull`、`npm install`、`pkill` 来“修一下”；
有问题回到本地修、合并 main、重新部署。

---

## 6. 部署前检查清单

- [ ] 改动已合并到 `main` 并推到 `origin/main`
- [ ] 后端：`npm test` / 目标模块测试通过
- [ ] 后端：`npx tsc --noEmit` 通过（联调期间不要跑 `npm run build`）
- [ ] 后台：`npm run build` 通过
- [ ] 有数据库变更：migration 已提交，且在生产执行
- [ ] 确认这次到底改没改对应端（脚本会自动判断，必要时 `--force`）
- [ ] 没有其他会话正在部署（`bash scripts/gate.sh status`）

---

## 7. 部署后验证

- 后端：`systemctl is-active sevenkitchen-backend`、健康接口、关键日志无报错。
- 后台：打开首页，确认静态资源加载正常。
- 数据库：migration 状态正常，关键表可读。
- 向用户报告：部署提交、时间、健康检查结果；失败要说明失败原因和当前状态。

---

## 8. 回滚

1. 不要把生产机当开发机手改源码。
2. 回滚 = 把 `main` 回退到上一个稳定提交（或修复后重新提交），再重新部署。
3. 数据库 migration 的回滚要单独评估；不要直接删表/删列。
4. 回滚后同样跑健康检查并报告。

---

## 9. 常见故障

| 现象 | 先查 |
|---|---|
| SSH 连不上 | key 是否存在、`1.14.3.2` 是否可达、防火墙 22 |
| 服务起不来 | `systemctl status`、`journalctl -n 200`、`dist/src/main.js` 是否存在 |
| 健康检查失败 | 端口是否对、`.env` 是否加载、数据库是否可达 |
| 后台白屏 | `index.html` 是否存在、静态资源路径、Nginx 配置 |
| 部署没变化 | 是否合并到 `origin/main`、是否被门禁/无改动跳过、是否需要 `--force` |

---

## 10. 历史文档

以下旧文档已归档到 `docs/_archive/legacy/`，只作历史参考：

- `DEPLOYMENT.md`（旧的 `git pull` + `pkill` 手工流程）
- `REMOTE_DEPLOY_GUIDE.md`（旧的脚本说明）
- `SSH_REFACTOR.md`（SSH 重构过程记录）
