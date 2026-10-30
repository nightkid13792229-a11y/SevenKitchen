/**
 * 标签打印相关API
 */
import { request } from '../../../utils/api';

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

export interface PackagePlanItem {
  packageSpecG: number;
  packageCount: number;
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
  packagePlan?: PackagePlanItem[];
  nutritionAnalysis?: NutritionAnalysis;
  shelfLife: string;
  cookingMethod?: CookingMethod | string;
  productionTime: string;
  /** 饲料添加剂（顿号分隔，只写目录规范名称）——传了才渲染独立「添加剂组成」段 */
  additiveIngredients?: string;
  /** 本单用到的原料 ID，用于服务端校验标签信息是否齐备 */
  ingredientIds?: string[];
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
    suppressErrorToast: true,
  });

  if (response.code !== 0) {
    throw new Error(response.message || '生成标签图片失败');
  }

  return response.data.imageBase64;
}
