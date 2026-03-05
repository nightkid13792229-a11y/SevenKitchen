/**
 * 标签打印相关API
 */
import { request } from '../utils/api';

/**
 * 营养成分分析数据
 */
export interface NutritionAnalysis {
  proteinPercent?: number;
  fatPercent?: number;
  ashPercent?: number;
  moisturePercent?: number;
  crudeFiberPercent?: number;
  carbohydratePercent?: number;
  energyDensityKcalPerKg?: number;
  calciumPhosphorusRatio?: string;
}

/**
 * 烹饪方法
 */
export interface CookingMethod {
  steam: string;
  stew: string;
  sousvide: string;
}

/**
 * 标签数据
 */
export interface LabelData {
  brandName: string;
  recipeName: string;
  nutritionStandard: string;
  lifeStages: string[];
  healthTags: string[];
  dogName: string;
  foodIngredients: string;
  supplementIngredients: string;
  weightPerPack: number;
  packageCount: number;
  totalWeight: number;
  nutritionAnalysis?: NutritionAnalysis;
  shelfLife: string;
  cookingMethod?: CookingMethod | string;
  productionTime: string;
}

/**
 * 生成标签图片
 * @param labelData 标签数据
 * @returns base64编码的PNG图片（不含前缀）
 */
export async function generateLabelImage(labelData: LabelData): Promise<string> {
  const response = await request<{ imageBase64: string }>({
    url: '/labels/generate-image',
    method: 'POST',
    data: labelData,
  });

  if (response.code !== 0) {
    throw new Error(response.message || '生成标签图片失败');
  }

  return response.data.imageBase64;
}
