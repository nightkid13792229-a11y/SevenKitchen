/**
 * 标签映射表工具
 * 复用食谱详情页的标签映射逻辑
 */

import { request } from './api';

// 健康标签UUID到名称的映射（动态加载）
let healthTagUuidLabelMap: Record<string, string> = {};

/**
 * 加载健康标签映射表
 * 从后端API获取所有健康标签的UUID到label的映射关系
 */
export async function loadHealthTagMapping(): Promise<void> {
  try {
    const res = await request({
      url: '/recipes/filter-options',
      method: 'GET'
    });

    if (res.code === 0 && res.data?.healthTags && Array.isArray(res.data.healthTags)) {
      const uuidMap: Record<string, string> = {};
      res.data.healthTags.forEach((tag: any) => {
        if (tag.value && tag.label) {
          uuidMap[tag.value] = tag.label;
        }
      });
      healthTagUuidLabelMap = uuidMap;
      console.log('[LabelMapping] 健康标签映射表加载成功，共', Object.keys(uuidMap).length, '个标签');
    }
  } catch (error) {
    console.error('[LabelMapping] 加载健康标签映射表失败:', error);
  }
}

/**
 * 获取健康标签中文名称
 * @param tagOrUuid - 健康标签的UUID或枚举值
 * @returns 中文名称
 */
export function getHealthTagLabel(tagOrUuid: string): string {
  // 优先使用动态映射（UUID -> label）
  if (healthTagUuidLabelMap[tagOrUuid]) {
    return healthTagUuidLabelMap[tagOrUuid];
  }

  // 兼容旧的枚举值（用于向后兼容）
  const enumMap: Record<string, string> = {
    'HEALTHY': '健康',
    'PICKY_EATER': '挑食',
    'SENSITIVE_STOMACH': '敏感胃',
    'PANCREATITIS_SUPPORT': '胰腺炎友好',
    'LOW_FAT': '低脂',
    'SKIN_COAT_CARE': '护肤',
  };

  if (enumMap[tagOrUuid]) {
    return enumMap[tagOrUuid];
  }

  return tagOrUuid;
}

/**
 * 获取生命阶段标签中文名称
 * @param stage - 生命阶段代码
 * @returns 中文名称
 */
export function getLifeStageLabel(stage: string): string {
  const map: Record<string, string> = {
    'PUPPY': '幼犬期',
    'ADULT': '成犬期',
    'SENIOR': '老年犬期',
    'PREGNANCY': '妊娠期',
    'LACTATION': '哺乳期',
  };
  return map[stage] || stage;
}

/**
 * 获取营养标准中文名称
 * @param standard - 营养标准代码
 * @returns 中文名称
 */
export function getNutritionStandardLabel(standard: string): string {
  const map: Record<string, string> = {
    'FEDIAF_2021': 'FEDIAF 2021',
    'AAFCO_2019': 'AAFCO 2019',
    'GB_T_31216': '国标 GB/T 31216',
  };
  return map[standard] || standard;
}

/**
 * 获取原料类型中文名称
 * @param type - 原料类型代码
 * @returns 中文名称
 */
export function getIngredientTypeLabel(type: string): string {
  const map: Record<string, string> = {
    'FOOD': '食材',
    'SUPPLEMENT': '补剂',
    'PACKAGING': '包材',
  };
  return map[type] || type;
}
