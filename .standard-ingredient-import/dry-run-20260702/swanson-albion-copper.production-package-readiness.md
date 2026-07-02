# Swanson Albion 铜生产包准备状态

## 结论

- 用户已要求按同样方法将这款铜补剂加入生产库。
- 生产包已生成并已执行。
- 本地生产只读配置可用：`/Users/zhaochen/Documents/SevenKitchen/backend/.env.production.readonly`。
- 生产数据库只读角色已创建：`sevenkitchen_readonly`。
- DB 对齐已通过，alignment id：`5543a5b1ca65`。
- 生产包目录：`swanson-albion-copper-production-package`。
- 生产执行清单：`swanson-albion-copper.production-apply-checklist.md`。
- 生产执行结果：`swanson-albion-copper.production-apply-result.md`。
- 生产执行前备份已生成并校验通过：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-swanson-albion-copper-20260702-134925.dump`。
- 生产库反查已通过：精确同款为 1 条，且包装证据和 Supplement Facts 标签证据都存在。

## 命名决策

- 不建议把主名称只写成 `铜片`。
- 原因：这是泛称，无法区分 Swanson、NOW FOODS 或其他品牌的铜补剂，也无法体现规格。
- 推荐并已用于本地和生产记录的主名称：`Swanson Albion 铜 2mg 片`。
- 英文品名保留在型号中：`Albion Copper, 2 mg, 300 tablets`。

## 已完成

- 已根据用户提供的 iHerb 商品截图和瓶身 Supplement Facts 图片建立补剂记录。
- 已写入本地开发数据库。
- 已完成本地/生产 DB 对齐。
- 已生成生产包。
- 已生成生产执行前备份。
- 已将生产包上传到生产机临时目录：`/tmp/sevenkitchen-standard-ingredient-import/swanson-albion-copper-20260702`。
- 已以事务方式执行生产 `up.sql`。
- 生产新增原料 ID：`69cf7ec3-e39c-4367-8994-46db8e6a9946`。
- 生产记录类型：`SUPPLEMENT`。
- 包装证据和 Supplement Facts 标签证据已保存。
- 采购 SKU：0 条。
- 食材营养库映射：0 条。
- 标签分配：0 条。

## 未完成

- 当前没有阻塞生产 Apply 的未完成事项。
- 如需在管理后台直接使用该补剂，可继续做页面可见性和业务链路验证。

## 安全边界

- 本次已写入 1 条业务数据到生产数据库：`ingredient`。
- 本次已执行生产包 `up.sql`。
- 本次没有绕过生产只读 DB 对齐。
- 本次没有做全库迁移或全库同步。
- 本次没有创建采购 SKU。
