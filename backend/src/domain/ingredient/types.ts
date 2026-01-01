/**
 * Ingredient Property Types
 * These types define the JSON structure for Ingredient.properties field
 * Based on 07_Core_Architecture.md Section 2.3
 */

/**
 * Food Properties (when Ingredient.type === 'FOOD')
 */
export interface FoodProperties {
  // 采购与定性描述
  cfct_class: string; // CFCT分类 (e.g. "畜肉类", "油脂类")
  edible_yield_rate: number; // 可食部/出肉率 (Default 1.0, e.g. 0.85 for bone-in meat)
  main_nutrients_desc: string; // 主要营养价值 (e.g. "高蛋白, 富含铁")

  // 算法必需字段
  // Required ONLY if base_unit == 'ML'. Used to convert Vol(ml) -> Mass(g).
  density_g_per_ml?: number;
}

/**
 * 有效成分含量值（包含数值和单位）
 */
export interface ActiveNutrientValue {
  value: number;  // 显示的数值（原始输入值）
  unit: string;   // 单位 (mg, g, μg, IU, %)
}

/**
 * Supplement Properties (when Ingredient.type === 'SUPPLEMENT')
 */
export interface SupplementProperties {
  // 营养类型分类
  category_type: string; // Options: "MINERAL", "VITAMIN", "AMINO_ACID", "FATTY_ACID", "PROBIOTIC", "FUNCTIONAL", "OTHER"

  // 有效成分浓度表 (Key-Value Map)
  // 允许一款补剂包含多种营养素。
  // Key: 营养素名称 (e.g. "钙", "维生素D3", "EPA")
  // Value: {value: 显示数值, unit: 单位} - 保存用户输入的原始值和单位
  active_nutrients: Record<string, ActiveNutrientValue>;

  // 个性化损耗率 (Override Global)
  // 默认建议 1.05 (5%)。鱼油可设为 1.0, 易损粉末设为 1.10
  production_loss_rate?: number;
}

/**
 * Packaging Properties (when Ingredient.type === 'PACKAGING')
 */
export interface PackagingProperties {
  // 业务属性
  is_consumable: boolean; // true=消耗品(随单扣减), false=固定资产
  linked_item_id?: string; // 关联配件 (e.g. 4号箱绑定4号袋)
}
