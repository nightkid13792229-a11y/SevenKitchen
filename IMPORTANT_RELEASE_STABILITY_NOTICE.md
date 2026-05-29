# SevenKitchen Release Stability Notice

> 合并、部署、上传小程序审核前，请先阅读本文件。
> 本项目当前同时存在稳定上线功能、实验功能和其他开发分支。任何人修改或合并时，必须以“先保证登录、支付、客服、订单、退款、售后稳定”为第一优先级。

## 当前稳定上线基线

- 稳定恢复分支：`hotfix/audit-login-stable-20260529-194406`
- 稳定恢复提交：`9454664260495435479063d5e6a165eb530282d5`
- 当前服务器后端已部署到该提交。
- 该基线用于小程序审核/线上恢复，目标是稳定可登录、可下单、可支付、可退款、客服链路可用。

## 当前稳定基线包含

- 微信登录与手机号/账号迁移相关能力
- 微信支付下单、支付唤起、支付回调
- 订单、售后、退款、退款记录与管理员退款流程
- 客服基础通路、客服配置、客服上下文与客服工作台相关稳定能力
- 微信订单/发货信息同步相关稳定能力
- 后台支付配置、客服配置、订单/售后/退款管理

## 当前稳定基线明确不包含

以下内容属于后续或副本实验内容，未经项目负责人明确批准，不得进入审核包、线上后端或主线稳定版本：

- 专属食谱推荐
- 新版首页/高保真首页
- `副本-首页高保真` 分支内容
- `前端优化` 分支中未验收的首页/专属推荐内容
- `recipe-designer` 配方设计器相关未验收功能
- `ingredient-creation` 等其他未确认上线的实验功能
- 后台评价管理等由前端优化批次附带但未确认上线的内容

## 禁止事项

- 禁止直接把 `origin/main` 当作审核/上线包来源，除非已确认其中所有新合并业务都通过测试并且服务器同步部署。
- 禁止只上传小程序、不部署对应后端。
- 禁止只部署后端、不确认小程序包对应同一提交。
- 禁止把副本、高保真、专属食谱、新首页等半成品混入审核包。
- 禁止未备份就 `reset --hard`、强推、覆盖服务器目录或删除数据库/配置文件。
- 禁止覆盖服务器 `.env`、支付证书、客服配置、上传资源配置。

## 修改与合并流程

1. 先确认目标版本：
   - 审核/线上稳定：优先从 `hotfix/audit-login-stable-20260529-194406` 开始。
   - 新功能开发：单独创建 `feature/...` 分支。
   - 实验视觉/首页：必须放在副本或实验分支，不能直接合稳定线。

2. 修改前必须检查：
   ```bash
   git status --short --branch
   git log -1 --oneline
   ```

3. 修改前必须备份：
   ```bash
   git branch backup/<name>-before-<change>-YYYYMMDD-HHMMSS
   git tag backup-<name>-before-<change>-YYYYMMDD-HHMMSS
   ```

4. 合并前必须先在临时验证分支测试，不要直接污染稳定分支：
   ```bash
   git switch -c verify/<change-name> <stable-branch>
   git merge <feature-branch>
   ```

5. 合并后必须排查禁止内容：
   ```bash
   rg "专属食谱|personalized|recipeRecommendationApi|recommendations/:dogId|dog-fit|高保真|recipe-designer|ingredient-creation|评价管理|views/Reviews"
   ```
   如果命中内容属于未批准功能，必须停止并重新拆分。

6. 合并后至少跑三端构建：
   ```bash
   cd backend
   npx prisma generate
   npx nest build
   node copy-fonts.js
   ```
   ```bash
   cd admin-web
   npm run build
   ```
   ```bash
   cd miniapp
   npm run build:mp-weixin
   ```

7. 服务器部署时，小程序和后端必须来自同一稳定提交或明确兼容的提交。部署后必须验证：
   ```bash
   pm2 status
   curl -i http://127.0.0.1:3000/api/v1/global-config
   ```

8. 小程序上传前必须确认：
   - 后端已在线且接口返回 200。
   - 小程序构建目录是 `miniapp/dist/build/mp-weixin`。
   - 上传版本说明必须写清楚本次功能范围。
   - 未经负责人明确同意，不得上传审核包。

## 服务器注意事项

- 生产后端目录：`/opt/sevenkitchen/SevenKitchen/backend`
- PM2 服务名：`sevenkitchen-backend`
- 后端入口应存在：`/opt/sevenkitchen/SevenKitchen/backend/dist/src/main.js`
- 如果 PM2 反复重启，先查：
  ```bash
  pm2 status
  pm2 logs sevenkitchen-backend --lines 120
  ss -ltnp 'sport = :3000'
  ```
- 如果出现 `MODULE_NOT_FOUND dist/src/main.js`，先重新构建后端。
- 如果出现 `EADDRINUSE 0.0.0.0:3000`，先查是否有孤儿 Node 进程占用端口，处理后再由 PM2 单独启动。

## 给其他开发者的合并提醒

- 如果你的分支基于 `origin/main`，不要直接要求合并进审核稳定线。先说明你的变更范围，由负责人确认是否属于本次上线。
- 如果你的功能涉及登录、订单、支付、退款、客服、数据库迁移、Prisma schema，必须单独列出影响面和回滚方案。
- 如果你的分支包含 UI 大改、首页、推荐、实验页面，请默认视为“不能上线”，除非负责人明确批准。
- 合并冲突时不要凭感觉选 `ours/theirs`。先说明冲突文件和业务含义，再处理。
- 任何部署和上传前，都要确保“服务器后端版本”和“小程序上传包版本”匹配。

## 当前结论

稳定上线优先使用：

```text
hotfix/audit-login-stable-20260529-194406
9454664260495435479063d5e6a165eb530282d5
```

半成品和副本内容可以长期保留在分支中，但不得进入当前审核/线上稳定包。
