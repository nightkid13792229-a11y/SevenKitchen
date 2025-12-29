/**
 * 导入原料数据到数据库
 * 数据来源: /tmp/ingredient_data.json (由Excel转换而来)
 */

import { PrismaClient, IngredientType, BaseUnit } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

// 类别映射到IngredientType
const CATEGORY_TYPE_MAP: Record<string, IngredientType> = {
  '蔬菜': IngredientType.FOOD,
  '营养品': IngredientType.SUPPLEMENT,
  '香料': IngredientType.FOOD,
  '谷物': IngredientType.FOOD,
  '内脏': IngredientType.FOOD,
  '水果': IngredientType.FOOD,
  '包装': IngredientType.PACKAGING,
  '种子': IngredientType.FOOD,
  '鱼肉': IngredientType.FOOD,
  '其他': IngredientType.FOOD
};

// CFCT分类映射
const CATEGORY_TO_CFCT: Record<string, string | null> = {
  '蔬菜': '蔬菜类及制品',
  '营养品': null,
  '香料': '调味品类',
  '谷物': '谷类及制品',
  '内脏': '畜肉类及制品',
  '水果': '水果类及制品',
  '包装': null,
  '种子': '坚果种子类',
  '鱼肉': '水产类',
  '其他': '其他'
};

interface ExcelRow {
  编号: string;
  类别: string;
  项目: string;
  '品牌/来源': string | null;
  费用: number;
  单量: number;
  单位: string;
  '单价/500单位': number;
  可食部: number;
  说明: string | null;
  主要作用: string | null;
}

function determineBaseUnit(unit: string): BaseUnit {
  const unitLower = unit.toLowerCase();

  if (unitLower.includes('g') || unitLower.includes('克')) {
    return BaseUnit.G;
  } else if (unitLower.includes('ml') || unitLower.includes('毫升')) {
    return BaseUnit.ML;
  } else {
    return BaseUnit.PCS;
  }
}

function mapRowToIngredient(row: ExcelRow) {
  const category = row.类别.trim();
  const ingredientType = CATEGORY_TYPE_MAP[category] || IngredientType.FOOD;

  const name = row.项目.trim();
  const brand = row['品牌/来源']?.trim() || null;
  const notes = row.说明?.trim() || null;

  const purchaseUnit = row.单位.trim();
  const baseUnit = determineBaseUnit(purchaseUnit);

  const singleQuantity = row.单量 || 1;
  const price = row.费用 || 0;

  // 计算换算比例
  let purchaseToBaseRatio: number;
  if (baseUnit === BaseUnit.G) {
    purchaseToBaseRatio = singleQuantity;
  } else if (baseUnit === BaseUnit.ML) {
    purchaseToBaseRatio = singleQuantity;
  } else {
    purchaseToBaseRatio = 1;
  }

  // 构建properties
  let properties: any;

  if (ingredientType === IngredientType.FOOD) {
    const cfctClass = CATEGORY_TO_CFCT[category];
    const edibleYieldRate = row.可食部 || 1.0;
    const mainNutrientsDesc = row.主要作用?.trim() || '';

    properties = {
      cfct_class: cfctClass,
      edible_yield_rate: edibleYieldRate,
      main_nutrients_desc: mainNutrientsDesc
    };
  } else if (ingredientType === IngredientType.SUPPLEMENT) {
    properties = {
      category_type: 'OTHER',
      active_nutrients: {}
    };
  } else {
    // PACKAGING
    properties = {
      is_consumable: true
    };
  }

  return {
    name,
    type: ingredientType,
    brand,
    productModel: null,
    purchaseChannel: null,
    notes,
    baseUnit,
    unitDisplayLabel: purchaseUnit,
    purchaseUnit,
    purchaseToBaseRatio,
    currentPricePerPurchaseUnit: price,
    weightG: null,
    maxCapacityG: null,
    properties
  };
}

async function main() {
  console.log('='.repeat(60));
  console.log('原料数据导入工具');
  console.log('='.repeat(60));

  try {
    // 1. 读取JSON数据
    console.log('\n正在读取数据文件: /tmp/ingredient_data.json');
    const jsonContent = fs.readFileSync('/tmp/ingredient_data.json', 'utf-8');
    const jsonData = JSON.parse(jsonContent);

    console.log(`✓ 读取到 ${jsonData.data.length} 条数据`);

    // 2. 显示类别分布
    const categoryStats: Record<string, number> = {};
    jsonData.data.forEach((row: ExcelRow) => {
      const cat = row.类别;
      categoryStats[cat] = (categoryStats[cat] || 0) + 1;
    });

    console.log('\n类别分布:');
    Object.entries(categoryStats)
      .sort(([, a], [, b]) => b - a)
      .forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count} 条`);
      });

    // 3. 转换数据
    console.log('\n正在转换数据...');
    const ingredients = [];
    const skipped = [];

    for (let i = 0; i < jsonData.data.length; i++) {
      const row = jsonData.data[i];

      if (!row.项目) {
        skipped.push(`行 ${i + 2}: 缺少项目名称`);
        continue;
      }

      try {
        const ingredient = mapRowToIngredient(row as ExcelRow);
        ingredients.push(ingredient);
      } catch (error: any) {
        skipped.push(`行 ${i + 2}: ${error.message}`);
      }
    }

    console.log(`✓ 成功转换 ${ingredients.length} 条数据`);

    if (skipped.length > 0) {
      console.log(`\n跳过 ${skipped.length} 行:`);
      skipped.slice(0, 10).forEach(s => console.log(`  - ${s}`));
      if (skipped.length > 10) {
        console.log(`  ... 还有 ${skipped.length - 10} 条`);
      }
    }

    // 4. 确认导入
    console.log('\n即将导入数据到数据库...');
    console.log(`数据库: PostgreSQL`);

    // 5. 执行批量导入
    console.log('\n开始导入...');

    // 使用createMany批量创建（Prisma支持）
    const result = await prisma.ingredient.createMany({
      data: ingredients,
      skipDuplicates: true // 跳过重复数据
    });

    console.log(`\n✓ 成功导入 ${result.count} 条原料数据`);

    // 6. 显示统计
    const stats = await prisma.ingredient.groupBy({
      by: ['type'],
      _count: {
        type: true
      }
    });

    console.log('\n数据库中原料统计:');
    stats.forEach(stat => {
      console.log(`  ${stat.type}: ${stat._count.type} 条`);
    });

    // 7. 显示示例数据
    console.log('\n前3条导入的数据:');
    const samples = await prisma.ingredient.findMany({
      take: 3,
      orderBy: {
        createdAt: 'desc'
      }
    });

    samples.forEach((ing, idx) => {
      console.log(`\n${idx + 1}. ${ing.name} (${ing.type})`);
      console.log(`   品牌: ${ing.brand || '无'}`);
      console.log(`   单价: ¥${ing.currentPricePerPurchaseUnit} / ${ing.purchaseUnit}`);
      console.log(`   说明: ${ing.notes || '无'}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('导入完成!');
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('\n✗ 导入失败:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
