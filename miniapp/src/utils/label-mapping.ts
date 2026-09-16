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
    'PUPPY_UNDER_14_WEEKS': '小于14周幼犬',
    'PUPPY_14_WEEKS_PLUS': '大于等于14周幼犬',
    'LOW_ACTIVITY_ADULT_OR_SENIOR': '低运动量成犬或老年犬',
    'HIGH_ACTIVITY_ADULT': '普通或高运动量成犬',
    'REPRODUCTION': '繁殖期',
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
    'FEDIAF_2025': 'FEDIAF 2025',
    'AAFCO_2019': 'AAFCO 2019',
    'GB_T_31216': '国标 GB/T 31216',
  };
  return map[standard] || standard;
}

/**
 * 获取营养标准的通俗解释（用于"符合 XX 犬营养标准"背书卡的展开说明）
 * @param standard - 营养标准代码
 * @returns 通俗解释文案
 */
export function getNutritionStandardExplain(standard: string): string {
  const map: Record<string, string> = {
    'FEDIAF_2021':
      'FEDIAF（欧洲宠物食品工业联合会）制定的犬营养标准，规定了幼犬、成犬、老年犬等各生命阶段必需营养素的最低与最高限量。',
    'FEDIAF_2025':
      'FEDIAF（欧洲宠物食品工业联合会）制定的犬营养标准，规定了幼犬、成犬、老年犬等各生命阶段必需营养素的最低与最高限量。',
    'AAFCO_2019':
      'AAFCO（美国饲料管理官方协会）制定的犬营养标准，是北美宠物食品的通行依据。',
    'AAFCO_2021':
      'AAFCO（美国饲料管理官方协会）制定的犬营养标准，是北美宠物食品的通行依据。',
    'AAFCO_2022':
      'AAFCO（美国饲料管理官方协会）制定的犬营养标准，是北美宠物食品的通行依据。',
    'NRC_2006':
      'NRC（美国国家科学研究委员会）发布的犬营养需要量，是动物营养学研究的权威参考。',
    'GB_T_31216':
      'GB/T 31216 是中国国家标准《全价宠物食品 犬粮》，规定了全价犬粮的营养指标要求。',
  }
  return (
    map[standard] ||
    '该食谱按所选营养标准设计，覆盖对应生命阶段的必需营养素。'
  );
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
