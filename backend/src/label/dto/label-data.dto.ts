import { ApiProperty } from '@nestjs/swagger';

/**
 * 营养成分分析数据
 */
export class NutritionAnalysisDto {
  @ApiProperty({ description: '蛋白质百分比', required: false })
  proteinPercent?: number;

  @ApiProperty({ description: '脂肪百分比', required: false })
  fatPercent?: number;

  @ApiProperty({ description: '灰分百分比', required: false })
  ashPercent?: number;

  @ApiProperty({ description: '水分百分比', required: false })
  moisturePercent?: number;

  @ApiProperty({ description: '粗纤维百分比', required: false })
  crudeFiberPercent?: number;

  @ApiProperty({ description: '碳水化合物百分比', required: false })
  carbohydratePercent?: number;

  @ApiProperty({ description: '能量密度 (kcal/kg)', required: false })
  energyDensityKcalPerKg?: number;

  @ApiProperty({ description: '钙磷比', required: false })
  calciumPhosphorusRatio?: string;
}

/**
 * 烹饪方法
 */
export class CookingMethodDto {
  @ApiProperty({ description: '蒸制时间' })
  steam!: string;

  @ApiProperty({ description: '炖煮时间' })
  stew!: string;

  @ApiProperty({ description: '低温慢煮时间' })
  sousvide!: string;
}

/**
 * 标签数据传输对象
 * 与小程序 LabelData 接口保持一致
 */
export class LabelDataDto {
  @ApiProperty({ description: '品牌名称' })
  brandName!: string;

  @ApiProperty({ description: '食谱名称' })
  recipeName!: string;

  @ApiProperty({ description: '营养标准' })
  nutritionStandard!: string;

  @ApiProperty({ description: '适用生命阶段', type: [String] })
  lifeStages!: string[];

  @ApiProperty({ description: '健康标签', type: [String] })
  healthTags!: string[];

  @ApiProperty({ description: '狗狗名称' })
  dogName!: string;

  @ApiProperty({ description: '食材原料（用顿号分隔）' })
  foodIngredients!: string;

  @ApiProperty({ description: '补充剂原料（用顿号分隔）' })
  supplementIngredients!: string;

  @ApiProperty({ description: '每袋重量(g)' })
  weightPerPack!: number;

  @ApiProperty({ description: '袋数' })
  packageCount!: number;

  @ApiProperty({ description: '总重量(g)' })
  totalWeight!: number;

  @ApiProperty({ description: '营养成分分析', required: false })
  nutritionAnalysis?: NutritionAnalysisDto;

  @ApiProperty({ description: '保质期说明' })
  shelfLife!: string;

  @ApiProperty({ description: '烹饪方法', required: false })
  cookingMethod?: CookingMethodDto | string;

  @ApiProperty({ description: '制作时间' })
  productionTime!: string;
}
