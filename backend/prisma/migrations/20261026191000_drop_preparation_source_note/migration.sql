-- 2026-10-26 Phase 3：删除已停用的预处理来源/补充说明列。
--
-- 说明：
--  · preparation_note 全库为 0 条；preparation_source 仅剩 155 条历史 AUTO/MANUAL 标记；
--  · 两者已不在界面展示，也不再参与业务；
--  · 备份已导出到本地 prep-source-note-backup-20261026.json。
--
-- 历史发布快照是独立 JSON，不受影响。
ALTER TABLE design_recipe_item
  DROP COLUMN IF EXISTS preparation_note,
  DROP COLUMN IF EXISTS preparation_source;

ALTER TABLE recipe_item
  DROP COLUMN IF EXISTS preparation_note,
  DROP COLUMN IF EXISTS preparation_source;
