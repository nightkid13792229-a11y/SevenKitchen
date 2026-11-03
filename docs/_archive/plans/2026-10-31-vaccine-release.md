# 疫苗上线记录（2026-10-31）

## 代码

- B0 特征测试翻面：`8bfb0efc`，9 条全绿。
- `origin/main`：`45c56796`（含疫苗全部修复 + 发货实际运费/商品卡调整）。
- 本地部署构建：`45bb6e1a`（与 `45c56796` **同树**；因本机 `git fetch` 卡住，
  用线上生产仓库导出的补丁在本地重放，提交号不同、代码一致）。
- 本地 `feat/vaccine-foundations-20261030` 分支 HEAD 为 `45bb6e1a`；没有推这个分支。

## 后端部署

- `remote_deploy_v2.sh` 正常流程第一步 `git fetch` 在本机卡住（GitHub SSH 连接），
  改用“线上生产仓库导出的同树补丁 + 本地构建”的等价路径；**没有在生产机编译**。
- 生产源码：`45c56796`；运行中的 dist：同树构建。
- 健康检查 5/5：服务、端口、本机 health、公网 health、数据库连接。
- Prisma：257 个 migration，`Database schema is up to date!`（#2 的决定表迁移已应用）。

## 小程序

- 构建：`cd miniapp && npm run build:mp-weixin` ✅
- 体验版上传：
  - `2026.10.31.1`（第一次，疫苗修复）
  - **`2026.10.31.2`（最终，疫苗修复 + 发货/商品卡调整；`✔ upload`）**
- **没有发布正式版**；只上传体验版。
- 构建目录：`/Users/zhaochen/Documents/SevenKitchen/.worktrees/vaccine-foundations/miniapp/dist/build/mp-weixin`

## 测试

- 后端疫苗/健康：**607 条全绿**（含 B0 9 条、B7/B5 4 条）。
- miniapp：**1932 条全绿**。
- 全量后端：4999 条，**4 条失败**均为与疫苗无关的日期敏感用例
  （补剂售后 1 条；定制餐订单守卫 3 条，午夜跨日导致）。

## 已知事项

1. **V6 到点提醒**仍独立立项（订阅消息 + 到期查询），不在本次上线范围。
2. 本地 `main` 分支的工作树 `/Users/zhaochen/Documents/SevenKitchen-release-staff-assisted-orders`
   有别的未提交改动，**我没有动它**；它仍停在 `c6c0b3ba`。
   线上 `origin/main` 已经是 `45c56796`；需要更新本地 `main` 时请先清理那边。
3. 审计/计划文档还在主工作区未提交（`docs/plans/...`），没有随代码上线。
4. 最早那次部署的 dist 是 `8bfb0efc`；随后已用同树 `45bb6e1a` 重新部署，
   生产和 `origin/main` 的树一致。
