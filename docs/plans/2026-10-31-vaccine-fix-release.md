# 疫苗验收修复上线记录（2026-10-31）

## 修复

- 提交：`f084efed`（`origin/main`，基于最新 `73189aa9`）。
- 问题：抗体保存成功后数据已写入，但页面停在旧计划，重进才更新。
- 修复：`onSaveTest` 调整为**先提示“已保存”，再 `refreshAfterWrite()`**，与 `onSaveRecord` 同序。
- 回归测试：`vaccine-tab.regression.spec.ts` 90 条通过；
  新增“抗体保存顺序”和“开关失败页保留书签 + 重试”两条。

## 验证与发布

- `vaccine-tab.regression.spec.ts`：**90 绿**；
- `npm run build:mp-weixin`：通过；
- 体验版上传：**2026.10.31.1**（`f084efed`），使用 `scripts/upload-trial.sh`，`✔` 成功；
- 构建来源：`origin/main` 干净目录，不受当前工作区影响。

## 未完成/已知

1. **F10 真实网络失败页**：自动化工具只能全局 mock `wx.request`，无法只让 `/health/vaccine-feature` 失败；
   代码和单测已覆盖，真实失败页还没在模拟器可靠复现。
2. **V6 到点提醒**：独立立项（订阅消息 + 到期查询），未做。
3. **8 只验收测试狗**（`验收-V1…V17`）仍保留在管理员账号，方便复验；确认后可清理。
4. 正式版仍需微信审核；体验版已上传，未发布正式版。
