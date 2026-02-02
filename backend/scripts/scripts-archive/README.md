# Scripts Archive

此目录存放 SevenKitchen 项目开发过程中使用的历史遗留脚本。

## 📂 归档时间

2026-02-02

## 📋 归档原因

这些脚本主要用于：
- 开发阶段的功能验证（Phase 2-8）
- 一次性数据迁移
- 临时测试和诊断
- 旧版本部署工具

这些脚本已完成历史使命，为保持 `scripts/` 目录简洁而归档至此。

## 🔧 归档脚本分类

### Phase 验证脚本（20+个）

开发阶段的端到端验证脚本，用于验证各阶段功能完整性：

- `phase2_2_verify.sh` - Phase 2.2 验证
- `phase3_1_addresses_verify.sh` - 地址管理验证
- `phase3_2_orders_list_verify.sh` - 订单列表验证
- `phase3_3_diy_sheet_verify.sh` - DIY表单验证
- `phase4_1_auth_context_verify.sh` - 认证上下文验证
- `phase4_2_jwt_auth_verify.sh` - JWT认证验证
- `phase4_3_verify.sh` - Phase 4.3 验证
- `phase5_verify.sh` - Phase 5 验证
- `phase6_verify.sh` - Phase 6 验证
- `phase7_1_pricing_breakdown_verify.sh` - 价格分解验证
- `phase7_2_price_explanation_verify.sh` - 价格说明验证
- `phase8_1_part1_persistence_smoke.sh` - 持久化冒烟测试
- `phase8_2_partA_address_persistence_smoke.sh` - 地址持久化验证
- `phase8_2b_dog_persistence_smoke.sh` - 狗狗持久化验证
- `phase8_3_recipe_persistence_smoke.sh` - 配方持久化验证
- `phase8_4_order_persistence_smoke.sh` - 订单持久化验证
- `phase8_5_address_persistence_smoke.sh` - 地址持久化验证
- `phase8_6_comprehensive_verify.sh` - 综合验证
- `phase8_11_allocation_lock_verify.sh` - 分配锁定验证
- `phase8_12_13_kitchen_inventory_e2e_verify.sh` - 库存E2E验证
- `phase8_14_shipping_fulfillment_e2e_verify.sh` - 物流履约E2E验证
- `phase_orders_closed_loop_verify.sh` - 订单闭环验证（**已移回主目录**）
- `comprehensive_verify.sh` - 综合验证脚本
- `order_persistence_smoke.sh` - 订单持久化冒烟测试
- `post_deploy_verify.sh` - 部署后验证
- `release_verify.sh` - 发布验证

### 数据迁移脚本（5个）

一次性数据库迁移和备份脚本：

- `migrate-all-data-to-production.sh` - 全量数据迁移到生产环境
- `migrate-production.sh` - 生产环境迁移
- `migrate-recipes-and-ingredients.sh` - 配方和食材迁移
- `migrate-recipes-to-production.sh` - 配方迁移到生产
- `migrate-to-purchasing.sh` - 采购模块迁移
- `backup-reimbursement-before-migration.sh` - 迁移前报销数据备份
- `fix-recipe-item-foreign-keys.sh` - 修复配方外键

### 清理和测试脚本（10+个）

临时数据清理和功能测试脚本：

- `cleanup-data.ts` - 数据清理
- `cleanup-purchase-list.ts` - 采购清单清理
- `cleanup-test-data.ts` - 测试数据清理
- `test-confirm-payment.ts` - 确认支付测试
- `test-delete-purchase-list.ts` - 删除采购清单测试
- `test-production.ts` - 生产环境测试
- `test-purchasing.ts` - 采购模块测试
- `verify-purchasing-fix.ts` - 采购修复验证
- `verify-purchasing-targetdate.ts` - 采购目标日期验证

### 诊断脚本（2个）

问题排查和诊断工具：

- `diagnose-duplicate-lists.ts` - 重复清单诊断
- `diagnose-jan25-orders.ts` - 1月25日订单问题诊断

### 其他工具脚本（3个）

- `create-admin.ts` - 创建管理员账号
- `seed-dog-breeds.ts` - 狗狗品种数据初始化
- `remote_deploy.sh` - 旧版远程部署脚本（已替换为 v2）

## ✅ 保留在主目录的脚本

以下脚本仍被项目使用，保留在 `backend/scripts/`：

- `start-check.ts` - 检查模式启动（package.json: `start:check`）
- `start-once.ts` - 单次启动服务（package.json: `start:once`）
- `assert_public_recipe.sh` - 配方验证（package.json: `verify:recipe`）
- `phase_orders_closed_loop_verify.sh` - 订单闭环验证（package.json: `verify:orders`）
- `remote_deploy_v2.sh` - 远程部署脚本（v2版本）
- `ssh-helper.sh` - SSH辅助工具
- `deploy_lighthouse.sh` - 腾讯云Lighthouse部署脚本
- `verify_env.sh` - 环境验证脚本
- `install_systemd_service.sh` - 系统服务安装

## 🔍 如何使用归档脚本

如需参考或运行归档脚本：

```bash
cd backend/scripts/scripts-archive
bash phase3_1_addresses_verify.sh  # 示例：运行地址验证脚本
```

## ⚠️ 注意事项

1. **不要删除此目录** - 归档脚本可能需要用于历史问题排查
2. **Git已跟踪** - 所有归档脚本仍在版本控制中
3. **仅供参考** - 这些脚本可能不再兼容当前代码库

## 📚 相关文档

- `docs/DATABASE_NAMING_CONVENTIONS.md` - 数据库命名规范
- `docs/07_Core_Architecture.md` - 核心架构文档
- `docs/05_API_Specs.md` - API规范

---

归档操作执行者：Claude Code
归档日期：2026-02-02
