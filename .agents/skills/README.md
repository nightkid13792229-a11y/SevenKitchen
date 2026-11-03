# 项目技能（DSH 结构）

本项目技能统一放在 `.agents/skills/<name>/SKILL.md`，每个技能一个目录。

DSH 会从以下位置发现技能：

- `<project>/.dsh/skills/`：项目专用
- `<project>/.agents/skills/`：项目共享（当前所有项目技能都在这里）
- `~/.dsh/skills/`、`~/.agents/skills/`：用户级

## 当前技能

| 技能 | 用途 |
|---|---|
| `production-ssh` | 生产服务器 SSH 操作规范 |
| `sevenkitchen-refactor` | SevenKitchen 模块重构纪律 |

已移除：

- `adding-standard-ingredients`：新增标准原料的半自动流程，2026-11-03 确认不再使用后删除。
  如以后需要恢复，从 git 历史里找回该目录。

## 约束

- 不要再新增 `.claude/skills/` 或项目根目录 `skills/`；旧目录已于 2026-11-03 迁移到这里。
- 技能目录只放 `SKILL.md`、`references/`、`assets/`、`scripts/` 等实际内容；
  不再放 Claude / Codex 专用的 `agents/openai.yaml` 之类元数据。
- 技能内的相对路径以仓库根为基准写清楚，避免移动目录后失效。
