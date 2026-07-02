# Jarrow Formulas B-Right 生产包准备状态

## 结论

- 用户已确认进入生产包准备流程。
- 生产包已生成并已执行。
- 本地生产只读配置已生成：`/Users/zhaochen/Documents/SevenKitchen/backend/.env.production.readonly`。
- 生产数据库只读角色已创建：`sevenkitchen_readonly`。
- 只读连接验证通过：可以读取生产库，写入探测被 PostgreSQL 拒绝。
- DB 对齐已通过，alignment id：`5543a5b1ca65`。
- 生产包目录：`jarrow-b-right-production-package`。
- 生产执行前清单：`jarrow-b-right.production-apply-checklist.md`。
- 本次用于验证和 DB 对齐的 SSH tunnel 已关闭；后续再次对齐时需要重新打开 tunnel。
- 生产执行前备份已生成并校验通过：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-jarrow-b-right-20260702-124615.dump`。
- 2026-07-02 远端生产初始只读检查结果：生产机 `/opt/sevenkitchen/SevenKitchen/backend/.env` 指向远端本机 `127.0.0.1:5432/sevenkitchen`，应用连接用户为 `postgres`；创建前数据库中未发现业务可用的 `sevenkitchen_readonly` / `readonly` 登录角色。
- 已在生产 PostgreSQL 创建只读登录角色并授予只读权限。

## 命名决策

- 不建议把主名称只写成 `B族维生素`。
- 原因：这是泛称，无法区分 Jarrow、NOW FOODS 或其他品牌的 B 族补剂。
- 推荐并已用于本地记录的主名称：`Jarrow Formulas B-Right B族维生素复合胶囊`。
- 英文品名保留在备注和型号中：`Jarrow Formulas B-Right Optimized B-Complex`。

## 已完成

- 本地旧演练记录已删除，避免同款补剂在本地留下多条记录。
- 已用推荐中文主名重新写入本地开发数据库。
- 新本地原料 ID：`814a9199-f944-4c8f-b651-61f6e4eea765`。
- 本地记录类型：`SUPPLEMENT`。
- 包装证据和 Supplement Facts 标签证据已保存。
- 用户已核对营养信息，确认没有问题。
- 采购 SKU：0 条。
- 食材营养库映射：0 条。
- 本地 apply 审计已附带 passing alignment id。
- manifest 已切换为 `production-package` 并打开 `productionPackageApproved`。
- 生产包包含文件：`manifest.json`、`review-summary.md`、`up.sql`、`down.sql`、`source-audit.json`、`unit-audit.json`。

## 未完成

- 生产包已在生产数据库执行。
- 生产数据库已写入这款补剂；执行后复查精确同款为 1 条。
- 生产 Apply 结果记录：`jarrow-b-right.production-apply-result.md`。
- 生产包 `up.sql` 尚未执行。

## 需要的下一步

1. 如需回滚，执行生产包中的 `down.sql`。
2. 如需在管理后台使用该补剂，继续做页面可见性和业务链路验证。

## 安全边界

- 本次已写入 1 条业务数据到生产数据库：`ingredient`。
- 本次已执行生产包 `up.sql`。
- 本次没有绕过生产只读 DB 对齐。
- 本次创建了生产只读数据库用户并授予只读权限；没有授予写权限。
