# 疫苗 F-A 执行记录（2026-10-30）

> 提交：`8d35d76b`（worktree `feat/vaccine-foundations-20261030`）
> 范围：F-A（低风险文案/状态/入口）；不改后端、不改数据结构。

## 已完成

| 项 | 改了什么 | 验证 |
|---|---|---|
| **F1 / V1 / V11** | 抗体检测那一行：角标/左侧/标题统一为“**建议复查 / 抗体复查**”；过期后写“**建议复查（原建议 … 已过）**”，不再写“下次评估 / 这次不用打” | `status.spec` + `f-a.spec` |
| **F5 / #2** | 忽略弹层改成“**这一类推迟 30 天，30 天后重新提醒**”；已忽略行显示“**30 天后（日期）再提醒**” | `IgnoreSheet` + `NextCard` |
| **F6 / #3** | 单苗/二联记录下提示“**只防…，不能顶核心一针；建议补打或咨询兽医**” | `partialCoreNote` 单测 |
| **F12 / Q7** | ≥20 周时，“下一针”收起状态同时给“**记录这一针 / 先测抗体**”两个同等按钮；<20 周不出现“测” | `canTiter` 按 `ageWeeks` 卡口 |
| **F2 / V2 / V17** | 后端已给“26 周补强 / 补一针 / 26 周后…”；页面直接显示，无写死 | 后端 B2 用例 + 页面源码 |
| **F4 / V10** | 记录区按 `conflicts.recordId` 显示“早于建议起始周龄…”；点开还有完整建议 | 后端 V10 用例 + 页面源码 |

## 验证

- miniapp：**1924 条全绿**（151 个测试文件）。
- 构建：`cd miniapp && npm run build:mp-weixin` ✅
- 构建产物：`/Users/zhaochen/Documents/SevenKitchen/.worktrees/vaccine-foundations/miniapp/dist/build/mp-weixin`
- 构建产物已抽查：`这一类怎么安排`、`先测抗体`、`建议复查`、`30 天`、`不能顶核心一针` 都在。
- **没有**上传体验版、没有部署、没有合并。

## 微信开发者工具打开

- 项目根：`/Users/zhaochen/Documents/SevenKitchen/.worktrees/vaccine-foundations/miniapp`
- 构建目录：上面的 `dist/build/mp-weixin`
- 这是**生产构建**（连线上 API），不是本地联调包。

## 还没做

- **F-B（交互）**：F3“补记以前打过的针”、F8 计划行“记录这一针”、F9 缺生日/返回刷新、F10 开关失败重试。
- **F-C（契约/文案）**：F7/V13 实际接种日（需后端 B7 下发 `matchedRecordDate`）；F11/B5 的狂犬 36 个月、钩端“我国部分地区”文案。
