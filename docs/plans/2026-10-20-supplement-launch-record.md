# 预分装补剂 · 上线记录（2026-10-20）

## 已部署

| 项目 | 提交 / 版本 | 结果 |
|---|---|---|
| 后端 | `b868a619` | 部署成功；生产 migration 192 条全部应用；健康检查 5/5 通过；旧后台售后入口已改走 case |
| admin-web | `089f645b` | 构建 + 上传成功；新增订单中心、补剂售后、补剂看板、40×60 打印页 |
| 生产库存开关 | `SUPPLEMENT_INVENTORY_RESERVATION_ENABLED=true` | 已写入并重启；回填候选 0，无历史待回填订单 |
| 小程序体验版 | `2026.10.20.3` | `✔ upload`；AppID `wx92924e25093f8f18`；含顾客取消/已付款退款入口；**未发布正式版** |

## 验证

- 后端 `npx tsc --noEmit -p tsconfig.build.json` 通过。
- 补剂相关 17 个 suite / 193 个用例通过。
- admin-web `npm run build` 通过。
- miniapp `npm run build:mp-weixin` 通过；微信开发者工具打开目录：`miniapp/dist/build/mp-weixin`。
- 生产接口：`/api/v1/health` 200；`/api/v1/admin/order-center`、`/api/v1/admin/supplement-shop/dashboard` 未登录均 401（路由存在）。

## 需要老板真机走一遍

1. DIY 制作单 → 一键购买预分装补剂 → 选择地址 → 支付。
2. 员工工作台：补剂订单 → 设置分装日 → 分装 → 打印 40×60 标签 → 填单号发货。
3. 顾客：我的补剂订单 → 改地址 / 申请售后 / 再次购买。
4. 后台：补剂看板、订单中心、补剂售后处理（退款/补发）。
5. 重点看：长品名标签是否溢出；员工端是否看不到金额；未发货退款后订单是否取消。

## 共享集成确认

- 定制食谱会话的 `feature/custom-recipe-weight-ux-20261004`（HEAD `d6b77078`）已验证是 `main` 的祖先，其改动已包含在本次 `main` 构建里，不是“只含补剂”。
- 共享流程：各自分支 → 合并 `main` → 从 `main` 构建 → 只由一个会话上传体验版。本次 `.3` 就是这样产出的。
- 微信一个 AppID 只有一个体验版；后续任何会话再上传，必须先确保自己的改动已合并进最新 `main`，避免覆盖。
