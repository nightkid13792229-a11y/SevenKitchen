# 预分装补剂 P7 · 迁移 / 回填 / 验证记录

日期：2026-10-20

## 1. 已完成

| 项目 | 结果 |
|---|---|
| 后端源码类型检查 | `npx tsc --noEmit -p tsconfig.build.json` 通过 |
| 补剂相关单测 | 17 个 suite / 193 个用例全部通过（定价、排期、库存、快照、售后、订单中心、看板、标签、员工脱敏） |
| admin-web 构建 | `npm run build` 通过 |
| miniapp 构建 | `npm run build:mp-weixin` 通过；体验版 `2026.10.20.3` 已上传，产物 `miniapp/dist/build/mp-weixin` |
| 本地补剂 migration | 已执行 `20261020110000_supplement_prepack_v2` 并标记 applied；本地库还有 15 个历史 migration 未应用，与本轮无关，未强行 `migrate dev` |
| 生产 migration 状态 | 191 个 migration 已全部应用；本轮新增 1 个，部署时只会新增这一条 |
| 库存回填 dry-run | `candidates=0/0`（本地库当前没有 PAID 且已排期的补剂单） |

## 2. 本轮关键规则（已落代码）

- 三类订单统一读模型只读；员工端金额由服务端脱敏（订单列表/详情/售后列表）。
- PACKED 售后：只允许全额退款；不允许补发；有未完结退款时禁止分装/发货；退款成功订单 CANCELLED，库存不释放。
- 退款逐笔按 `aftersale_case` 记录，累计不超实付；每个 case 最多一张补发单。
- 再次购买、未发货改地址、复购入口已接。
- 标签统一 **40×60mm 竖版**：后端 320×480、网页打印 CSS、小程序热敏打印机三处一致；字段含储存/用法/分装者。
- 库存预占开关默认关闭；先回填再开，避免老订单分装被拦。

## 3. 上线顺序（必须按顺序）

1. 合并 `origin/main` 并部署后端（会应用本轮 migration）。
2. 部署 admin-web。
3. 在生产执行库存回填 **dry-run**，核对后再 `--apply`。
4. 生产 `.env` 设置 `SUPPLEMENT_INVENTORY_RESERVATION_ENABLED=true` 并重启后端。
5. 小程序只构建 + 上传体验版，绝不发布正式版；体验版目录 `miniapp/dist/build/mp-weixin`。
6. 真机走一遍：DIY 制作单 → 一键买补剂 → 支付 → 员工排期/分装 → 40×60 标签 → 发货 → 顾客改地址/售后 → 后台退款/补发 → 再次购买。

## 4. 回滚

- 新接口/页面：回滚后端/admin-web 到上一提交；小程序回滚体验版。
- 库存开关：`SUPPLEMENT_INVENTORY_RESERVATION_ENABLED=false` 并重启，立即停止预占/扣减。
- 数据库：migration 只新增表/列/枚举，不回滚删除；代码回滚后新表保留不影响旧逻辑。
- 标签：代码回滚即回旧版；纸张仍是 40×60，不影响已打印标签。
