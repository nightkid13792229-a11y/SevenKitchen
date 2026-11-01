# 疫苗 F-B / F-C 执行记录（2026-10-30）

> 提交：`ef0d4dd3`（worktree `feat/vaccine-foundations-20261030`）
> 范围：F-B（交互）+ F-C（B7 实际接种日 / B5 文案）

## F-B（交互）

| 项 | 改了什么 |
|---|---|
| **F3 / V5** | 记录区头部加“**补记以前打过的针**”；打开同一个录入器，日期可选过去，保存后整屏重拉 |
| **F8** | 免疫计划里**当前这一行**可以直接点“**记录这一针**”（不展开详情） |
| **F9** | 缺生日时只挡“下一针/计划”，**记录区、录入器、上传识别不再跟着消失**；从建档页返回会主动重拉疫苗计划 |
| **F10 / V12** | 开关请求失败：**疫苗书签保留**，但板块内容不挂载、一个疫苗接口都不请求；页面给“**重试**” |

## F-C（契约 / 文案）

| 项 | 改了什么 |
|---|---|
| **F7 / V13** | 后端 `PlanStepDto` 新增 `matchedRecordDate`（实际接种日）；已完成行显示实际日，不显示计划日 |
| **F11 / B5** | 狂犬依据写明“36 个月是说明书免疫期，本程序仍按每年提醒（年审需要）”；钩端改为“**我国部分地区**属流行地区” |

## 验证

- 后端疫苗/健康：**597 条全绿**（含 B7/B5 4 条新用例）。
- miniapp：**1932 条全绿**（152 个文件）。
- 构建：`cd miniapp && npm run build:mp-weixin` ✅
- 构建目录：`/Users/zhaochen/Documents/SevenKitchen/.worktrees/vaccine-foundations/miniapp/dist/build/mp-weixin`
- 全量后端：4999 条，**4 条失败**都在与疫苗无关的日期敏感用例
  （补剂售后 1 条；定制餐订单守卫 3 条，午夜跨日导致）。疫苗/健康本身全绿。
- **没有**上传体验版、没有部署、没有合并。

## 还剩

1. **B0 的特征测试**（V2/V4/V5/V10/V17 等）还钉着旧行为，合并前要统一改成新行为。
2. **V6 到点提醒**仍是独立立项（订阅消息 + 到期查询），不在这一轮。
3. 合并到 `main` / 部署 / 上传体验版，等你确认后再做。

## 微信开发者工具

```
/Users/zhaochen/Documents/SevenKitchen/.worktrees/vaccine-foundations/miniapp/dist/build/mp-weixin
```

项目根：`/Users/zhaochen/Documents/SevenKitchen/.worktrees/vaccine-foundations/miniapp`。
