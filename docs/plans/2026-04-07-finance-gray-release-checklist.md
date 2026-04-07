# 财务中心灰度发布执行单

更新时间：2026-04-07  
适用分支：`codex/finance-center-v1`  
对应 PR：[#4 Add finance center foundation and UAT fixes](https://github.com/nightkid13792229-a11y/SevenKitchen/pull/4)

## 目标

以“先灰度、后正式”的方式，把财务中心第一版稳妥推进到生产环境，重点保证：

- 数据库结构已到位
- 管理后台和小程序主链路可用
- 财务口径不串
- 出现异常时可快速回滚

## 当前已完成验证

以下内容已在开发联调环境完成验证：

- `admin-web` 全量构建通过
- 财务相关后端测试通过，共 `4` 个 suite、`8` 个测试
- Web 管理后台主链路通过：
  - 财务总览
  - 费用与待支付
  - 费用分析
  - 经营贡献分析
  - 报销审核
- 费用单链路通过：
  - 新建待支付
  - 未付款口径
  - 标记已付款后现金流联动
- 报销链路通过：
  - 无付款凭证拦截
  - 驳回
  - 要求重新提交
  - 确认已报销后入账
- 小程序链路通过：
  - 小程序提交报销
  - Web 后台待审核
  - Web 确认已报销
  - 小程序状态回显

## 发布建议节奏

- `2026-04-07`：完成 PR review，部署预发或灰度环境
- `2026-04-07` 至 `2026-04-08`：观察 1 个工作日
- `2026-04-08`：灰度稳定后正式发布
- 如果希望更保守，可顺延至 `2026-04-09`

## 阶段 A：合并前收口

### A1. 代码冻结

- [ ] 冻结 `codex/finance-center-v1`，只允许修阻塞灰度的问题
- [ ] PR 范围确认无误，避免混入无关改动
- [ ] 确认 PR 描述已写明：
  - 财务中心
  - 费用单/待支付
  - 报销“已报销”语义
  - Web 管理后台联动
  - 小程序报销链路

### A2. 代码审查

- [ ] 完成至少一轮代码 review
- [ ] 特别检查数据库迁移与生产上传配置
- [ ] 确认本地开发兜底逻辑不会污染生产配置

### A3. 待确认风险

- [ ] 部署环境重新验证后端正式构建
说明：本地 `backend npm run build` 曾被 `EMFILE: too many open files, watch` 卡住；`npx tsc -p tsconfig.build.json --pretty false` 与 `node copy-fonts.js` 均已通过，因此更像本地环境限制，而非代码编译错误。部署机必须重新确认正式构建链路。

## 阶段 B：灰度前技术检查

### B1. 数据库迁移

- [ ] 目标环境已备份数据库
- [ ] 执行 `npx prisma generate`
- [ ] 执行 `npx prisma migrate deploy`
- [ ] 确认本次财务相关迁移已包含：
  - `20260403183000_add_reimbursement_paid_fields`
  - `20260403190000_add_finance_expense_foundation`
- [ ] 确认以下结构存在：
  - `reimbursement.paid_at`
  - `reimbursement.paid_by_id`
  - `expense_template`
  - `expense_bill`
  - `expense_bill_payment`

建议命令：

```bash
cd backend
npx prisma generate
npx prisma migrate deploy
```

### B2. 后端构建与启动

- [ ] 在部署环境执行后端正式构建
- [ ] 启动后端服务
- [ ] 验证健康检查：
  - `/api/v1/health`

建议命令：

```bash
cd backend
npm install
npm run build
npm run start:prod
```

如果部署环境也遇到 `EMFILE`，先单独执行：

```bash
cd backend
npx tsc -p tsconfig.build.json --pretty false
node copy-fonts.js
```

### B3. 财务接口检查

- [ ] `GET /api/v1/admin/finance/overview` 返回 `200`
- [ ] `GET /api/v1/admin/finance/alerts` 返回 `200`
- [ ] `GET /api/v1/admin/finance/expense-bills` 返回 `200`
- [ ] `GET /api/v1/admin/finance/expense-analysis` 返回 `200`
- [ ] `GET /api/v1/admin/finance/contribution-analysis` 返回 `200`

### B4. 上传配置检查

- [ ] 生产环境已配置真实 COS 凭据
- [ ] 确认生产环境不会走本地 mock 上传逻辑
- [ ] 随机上传 1 张图片，确认可预览、可回显

### B5. 前端与小程序构建准备

- [ ] 管理后台构建通过
- [ ] 小程序生产构建通过
- [ ] 小程序构建产物路径确认无误

建议命令：

```bash
cd admin-web
npm install
npm run build
```

```bash
cd miniapp
npm install
bash scripts/mp-weixin-build.sh
bash scripts/mp-weixin-verify.sh
```

## 阶段 C：灰度发布执行

### C1. Web 管理后台 smoke test

- [ ] 管理员可正常登录
- [ ] 左侧可见财务中心菜单
- [ ] 以下页面均可打开且无 `400/500`：
  - 财务总览
  - 费用与待支付
  - 费用分析
  - 经营贡献分析
  - 报销审核

### C2. 费用单链路验证

- [ ] 新建 1 笔待支付费用单
- [ ] 确认：
  - `实际费用` 变化
  - `现金流出` 不提前变化
  - `待支付金额` 增加
- [ ] 将该费用单标记为已付款
- [ ] 再确认：
  - `现金流出` 增加
  - `待支付金额` 减少
  - `实际费用` 不重复增加

### C3. 报销链路验证

- [ ] 在 Web 后台验证无付款凭证拦截
- [ ] 在 Web 后台验证驳回
- [ ] 在 Web 后台验证要求重新提交
- [ ] 上传付款凭证并确认已报销
- [ ] 确认 `现金流出` 与财务结果同步变化

### C4. 小程序链路验证

- [ ] 小程序可正常登录工作台角色
- [ ] 提交 1 笔报销申请
- [ ] Web 后台可见对应待审核报销
- [ ] Web 后台确认已报销后状态同步正常
- [ ] 小程序列表与详情状态同步变成 `已报销`

## 阶段 D：灰度观察

观察时长：建议至少 `1` 个工作日

### D1. 日志观察

- [ ] 无 Prisma 表/字段缺失错误
- [ ] 无财务接口 `500`
- [ ] 无图片上传失败堆积
- [ ] 无小程序报销状态异常

### D2. 业务抽查

- [ ] 抽查 1 笔费用单
- [ ] 抽查 1 笔已报销报销单
- [ ] 抽查 1 笔小程序新提交报销
- [ ] 确认来源单据与财务结果可解释

### D3. 数字核对

- [ ] 已报销金额可和报销管理对上
- [ ] 待支付金额可和费用单列表对上
- [ ] 现金流流出可由已报销与已付款费用单解释
- [ ] 经营收入与现金流入口径差异可解释

## 阶段 E：正式生产发布门槛

只有以下条件全部满足，才进入正式生产发布：

- [ ] 灰度环境稳定，无阻塞问题
- [ ] 数据库迁移在目标环境验证通过
- [ ] 后端正式构建与启动已在部署机验证通过
- [ ] 管理后台 smoke test 通过
- [ ] 小程序 smoke test 通过
- [ ] 财务关键数字可人工解释

## 阶段 F：正式生产上线步骤

建议在低峰时段执行：

1. [ ] 备份生产数据库
2. [ ] 部署后端代码
3. [ ] 执行 `npx prisma migrate deploy`
4. [ ] 重启后端服务
5. [ ] 验证健康检查与财务接口
6. [ ] 部署管理后台
7. [ ] 验证管理员登录与财务中心主页面
8. [ ] 构建并上传小程序版本
9. [ ] 完成上线后 smoke test

建议命令：

```bash
cd backend
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start:prod
```

```bash
cd admin-web
npm run build
```

```bash
./deploy-admin-web.sh
```

```bash
cd miniapp
bash scripts/mp-weixin-build.sh
```

## 阶段 G：回滚预案

### G1. 前端问题

- [ ] 回滚管理后台静态资源
- [ ] 回滚小程序上传版本或暂停提交审核

### G2. 后端问题

- [ ] 回滚后端服务到上一稳定版本
- [ ] 暂时关闭财务中心与报销新入口，避免继续产生错误数据

### G3. 数据库问题

- [ ] 确认是否需要停止业务写入
- [ ] 使用上线前数据库备份进行恢复
- [ ] 如果迁移已执行但不宜回滚，先停入口、保数据，再单独制定修复方案

## 发布负责人建议

### 技术侧

- 负责人：开发
- 负责内容：
  - 代码收口
  - 部署执行
  - 数据库迁移
  - 日志观察
  - 接口核查

### 业务侧

- 负责人：运营/管理员
- 负责内容：
  - 灰度验收
  - 报销与费用单实际业务确认
  - 财务数字解释与签字确认

## 结论

当前分支已经达到“可灰度发布”的状态。  
建议先按本执行单完成灰度部署与观察，再推进正式生产上线。
