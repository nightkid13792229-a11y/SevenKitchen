# 原料批量替换功能

> 更新日期：2026-09-03

## 功能说明

后台「原料管理」支持把某个原料**批量替换**为另一个原料（如同类型新品、换供应商、换规格），一次覆盖多个食谱，并自动重算营养报告。

### 入口

原料管理列表 → 行操作「批量替换」。

### 操作步骤

1. 选择替换为哪个新原料（只允许同类型：食材换食材、补剂换补剂）；
2. 系统列出所有使用该原料的食谱（含状态、版本、当前用量），可按 全部 / 已发布 / 草稿 筛选并勾选；
3. 点「预览影响」：每个食谱展示替换后营养报告对比（能量密度、水分、蛋白/脂肪/纤维/灰分/碳水干物质%、钙磷比）和提示信息；
   - 食材类：可逐食谱修改「每份克数」（如生重 20g → 熟重 15g）；
   - 补剂类：营养目标默认保留，理论粒数按新原料浓度自动换算（如 EPA+DHA 1700mg/kg 下新鱼油的理论粒数）；也可手动改目标值后「重新预览」；
4. 确认执行：事务内完成替换 + 营养报告重算覆盖，任一步失败整体回滚。

### 系统行为

| 项目 | 行为 |
| --- | --- |
| 食材类替换 | 只换原料引用，比例/克数默认不变（可预览时手改） |
| 补剂类替换 | 营养目标（nutrientTargetKey/Value、supplementTargets）保留，理论用量按新原料浓度自动计算 |
| 营养报告 | 复用设计器同款评估引擎重算并覆盖，`source = BATCH_INGREDIENT_REPLACE` |
| 能量密度 | 食谱 `energy_density_kcal_per_kg` 同步为重算值 |
| 版本 | 受影响食谱版本号 +1（与手动改原料语义一致） |
| 替代补剂 | 引用旧原料的替代品配置被清理 |
| 历史订单 | 不受影响（订单保存食谱快照） |
| 旧原料 | 保持启用，不做自动停用 |

### 边界与提示

- 新旧原料类型不一致时拒绝执行；
- 营养报告目标对比统一按 **FEDIAF_2025** 计算；原食谱标注 FEDIAF_2021 时会在预览中提示；
- 补剂目标支持组合字段（如「EPA+DHA」按 EPA+DHA 合计浓度换算）；
- 新原料缺少营养档案、补剂目标无法解析时：该补剂不参与营养报告计算，预览中给出警告；
- 报告评估场景（scenario）优先级：原报告 scenario → 食谱系列生命阶段 → 默认成犬场景。

## 后端接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/admin/ingredients/:id/batch-replace/affected-recipes` | 使用该原料的食谱清单 |
| POST | `/api/v1/admin/ingredients/:id/batch-replace/preview` | 预览影响（含报告对比，不改数据） |
| POST | `/api/v1/admin/ingredients/:id/batch-replace/execute` | 执行替换 + 重算报告（事务） |

入参（preview/execute 相同）：

```json
{
  "toIngredientId": "新原料ID",
  "recipeIds": ["食谱ID..."],
  "itemOverrides": [
    { "recipeItemId": "原料项ID", "exampleWeight": 15 },
    { "recipeItemId": "原料项ID", "nutrientTargetValue": 1800 }
  ]
}
```

## 代码位置

- 后端服务：`backend/src/application/ingredient/ingredient-batch-replace.service.ts`
- 报告构建共享模块：`backend/src/domain/recipe-designer/published-nutrition-report.ts`
- 接口：`backend/src/interfaces/controllers/ingredient-batch-replace.controller.ts`
- DTO：`backend/src/interfaces/dto/ingredient-batch-replace.dto.ts`
- 前端向导：`admin-web/src/views/Ingredients/components/IngredientBatchReplaceDialog.vue`
- API：`admin-web/src/api/ingredients.ts`
