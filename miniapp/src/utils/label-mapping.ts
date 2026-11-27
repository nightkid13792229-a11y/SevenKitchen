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
    'PUPPY_UNDER_14_WEEKS': '幼犬版（14 周内）',
    'PUPPY_14_WEEKS_PLUS': '幼犬版（14 周以上）',
    'LOW_ACTIVITY_ADULT_OR_SENIOR': '低活动成犬 / 老年版',
    'HIGH_ACTIVITY_ADULT': '成犬版',
    'REPRODUCTION': '繁殖期版',
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
 *
 * 2026-11-28：营养标准只用 FEDIAF 2025（老板定）。
 * 其他代码一律不翻译、也不回退原值 —— 返回空串，调用方据此不展示背书卡，
 * 免得把 AAFCO_2022 这类内部码当文案印给顾客。
 *
 * @param standard - 营养标准代码
 * @returns 中文名称；不是 FEDIAF 2025 时为空串
 */
export function getNutritionStandardLabel(standard: string): string {
  return standard === 'FEDIAF_2025' ? 'FEDIAF 2025' : '';
}

/**
 * 获取营养标准的通俗解释（用于"符合 XX 犬营养标准"背书卡的展开说明）
 *
 * 与 label 同一口径：只对 FEDIAF 2025 给说明。
 *
 * @param standard - 营养标准代码
 * @returns 通俗解释文案；不是 FEDIAF 2025 时为空串
 */
export function getNutritionStandardExplain(standard: string): string {
  if (standard !== 'FEDIAF_2025') return '';
  return 'FEDIAF（欧洲宠物食品工业联合会）制定的犬营养标准，规定了幼犬、成犬、老年犬等各生命阶段必需营养素的最低与最高限量。';
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

/**
 * 食谱状态中文名称
 *
 * 2026-11-28：员工客服页以前直接渲染 `recipe.status`，看到的是
 * PUBLIC / DRAFT / PRIVATE_CUSTOM。状态是内部码，界面只给中文。
 */
export function getRecipeStatusLabel(status?: string | null): string {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    PUBLIC: '公开',
    PRIVATE_CUSTOM: '私密定制',
  };
  return map[String(status ?? '')] || '-';
}
