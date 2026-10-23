# 食谱定制板块 Code Review（2026-10-23）

范围：后端 custom-recipe/recipe-designer 主链路、控制器、交付/售后/订单设计、系列发布、相关 Prisma 模型与迁移；后台 API/售后页面；小程序消费点。未逐行审计 12k 行 design assessment/knowledge-base 内部实现和全部 Vue 组件。

## 结论

核心领域设计扎实，但**不能直接宣布生产就绪**。审查发现 4 个 Critical、7 个 Important。

## Critical

1. **批次交付后订单列表丢失交付动作**（已修复）
   - 列表只从旧 `deliveries` 计算 hasAnyDelivery，未看 deliveryBatch。
   - 已把批次纳入列表，并由后端统一计算查看/确认/售后动作。
   - 生产接口已复核：2 份订单列表现在返回 VIEW_DELIVERY/CONFIRM_RECEIPT/APPLY_AFTERSALE。

2. **可绕过交付记录把订单标成 DELIVERED**（已修复）
   - 旧 create-recipe 直接 updateOrder 写 DELIVERED；通用改状态也允许。
   - 已改成交付服务创建记录/快照；通用状态接口禁止直接 DELIVERED；COMPLETED 必须有交付记录。

3. **多份订单可被单份交付，之后无法补齐**（已修复）
   - `deliver()` 未校验 recipeQuantity。
   - 已禁止多份订单走单份交付，必须整批。

4. **交付快照不可变性仍被 live Recipe 绕过**（未修复）
   - 售后重新打开设计后，私密 Recipe 原地更新；顾客从订单详情打开的是 live recipe，不是冻结快照。
   - 根因：`createOrUpdatePrivateRecipeSnapshot` 更新同一 Recipe 行，`order.recipeId` 指向它。
   - 建议：交付后从快照提供详情；或改稿创建新 Recipe 版本，重新交付时才切 order.recipeId。

## Important

5. ACCEPTED 售后未计入列表 open（已修复：PENDING/ACCEPTED/PROCESSING）。
6. 订单详情未传 hasOpenAftersale（已修复）。
7. 售后创建 check-then-create 无事务/唯一约束，双击可能重复（未修复）。
8. 交付批次 version 分配非并发安全（未修复）。
9. 售后 item id 在另一次重交后失效（未修复）。
10. 设计槽位容量 check-then-write 无 DB 约束（未修复）。
11. 测试大量 mock `$transaction`，未覆盖真实约束/并发（未修复）。

## Minor

- 快照狗狗时间使用 `new Date()` 而非注入 now；
- 交付确认截止时间提示丢 `autoCompleteAt`；
- 制作步骤注释与双写行为不一致；
- 售后撤回靠摘要 substring；
- 历史补剂替代迁移无回填；
- 后台列表 N+1 查询。

## 验证

- 后端 4595 通过
- 后台 789 通过
- 小程序 1915 通过
- 后端部署：`5c2dc97b`
- 后台已部署

## 建议

先解决 Critical 4 的快照/live 契约，再补真实 Postgres 并发集成测试；在此之前不宣称“生产就绪”。
