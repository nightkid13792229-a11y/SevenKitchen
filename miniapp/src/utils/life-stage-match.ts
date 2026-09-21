/**
 * 生命阶段：**前端只负责展示，判定与匹配一律由后端给出**
 *
 * ===== 2026-09-19 重构（治本）=====
 *
 * 此前本文件在小程序里**自己重算**生命阶段，有两个硬伤：
 *
 *   1) **认不出混血犬的体型**。后端的权威实现
 *      （`backend/src/domain/dog/dog-stage.service.ts`）判定生命阶段时会用
 *      `sizeClassOverride`（混血犬全都填了体型），而本文件完全没读这个字段；
 *      查不到品种那就算不出阶段，返回 null。
 *   2) **null 被当成"匹配"**。`isRecipeLifeStageMatch(..., null)` 返回 true，
 *      于是「算不出来」直接变成「静默放行」—— 该提醒时不提醒、不拦截，
 *      而且没有任何人会发现。一次 `/dogs/breeds` 请求失败就能让全站提醒消失。
 *
 * 现在改为：
 *   · 判定只有一个来源 —— 后端（`GET /recipes/:id/life-stage-match`）；
 *   · 前端只保留「把结论翻译成界面」所需的纯展示逻辑；
 *   · 中文名只有一份，放在 `utils/label-mapping.ts`。
 */

import { request } from './api';
import { getLifeStageLabel } from './label-mapping';

// 中文名统一由 label-mapping 提供，本文件不再维护第二份
export { getLifeStageLabel };

/** 后端给出的匹配结论类型（与 backend RecipeLifeStageMatchDto 对齐） */
export type LifeStageMatchType =
  | 'MATCHED'
  | 'MANUAL_MISMATCH'
  | 'FALLBACK_ADULT'
  | 'FALLBACK_FIRST'
  | 'LEGACY';

export interface LifeStageMatchVerdict {
  matchType: LifeStageMatchType;
  /** 后端给的提示文案（MANUAL_MISMATCH / FALLBACK_* 时才有） */
  message?: string;
  selectedLifeStage?: string;
  requestedLifeStage?: string;
  dogId?: string;
  dogName?: string;
  /** 后端按权威实现算出的「狗狗需要的食谱生命阶段」 */
  dogLifeStage?: string;
  dogLifeStageLabel?: string;
}

/**
 * 结论是否代表"当前版本与狗狗不匹配"，需要给顾客提示。
 *
 * LEGACY 表示这张食谱没有生命阶段版本之分（本来只有一个版本），
 * 不存在"不匹配"，因此不提示。
 */
export function isLifeStageMismatch(matchType?: string | null): boolean {
  return (
    matchType === 'MANUAL_MISMATCH' ||
    matchType === 'FALLBACK_ADULT' ||
    matchType === 'FALLBACK_FIRST'
  );
}

/**
 * 向后端索取「食谱 × 狗狗」的生命阶段匹配结论。
 *
 * 失败时**不抛错**，返回 null —— 调用方据此决定降级行为。
 * ⚠️ 绝不要在这里退化成"前端自己算"，那正是本次重构要消灭的问题。
 */
export async function fetchLifeStageMatch(params: {
  recipeId: string;
  dogId?: string | null;
  lifeStage?: string | null;
}): Promise<LifeStageMatchVerdict | null> {
  const recipeId = String(params.recipeId || '').trim();
  if (!recipeId) return null;

  const data: Record<string, string> = {};
  if (params.dogId) data.dogId = String(params.dogId);
  if (params.lifeStage) data.lifeStage = String(params.lifeStage);

  try {
    const res = await request({
      url: `/recipes/${recipeId}/life-stage-match`,
      method: 'GET',
      data,
      quiet: true,
      suppressErrorToast: true,
    } as any);

    if (res && res.code === 0 && res.data) {
      return res.data as LifeStageMatchVerdict;
    }
    return null;
  } catch (error) {
    console.warn('[LifeStage] fetch match verdict failed:', error);
    return null;
  }
}

/** 把生命阶段数组格式化成「A、B」 */
export function formatLifeStageList(stages: unknown): string {
  if (!Array.isArray(stages)) return '';
  return stages
    .map((stage) =>
      typeof stage === 'string' ? stage.trim().toUpperCase() : '',
    )
    .filter((stage): stage is string => Boolean(stage))
    .map((stage) => getLifeStageLabel(stage))
    .join('、');
}

/**
 * 提醒文案。
 *
 * 注意：**前端已经不再自己判定**，因此本函数只在后端没给 message 时兜底。
 * 正常情况下应优先使用 `verdict.message`。
 */
export function buildLifeStageReminderText(options: {
  applicableStages: unknown;
  dogLifeStage: string | null | undefined;
  dogName?: string;
}): string {
  const stageListText = formatLifeStageList(options.applicableStages);
  const dogName = options.dogName || '当前狗狗';
  const dogLifeStageText = options.dogLifeStage
    ? getLifeStageLabel(options.dogLifeStage)
    : '未知';

  if (!stageListText) {
    return `该食谱尚未配置适用生命阶段。当前选择的狗狗「${dogName}」为${dogLifeStageText}，建议确认后再继续。`;
  }

  return `该食谱适用于：${stageListText}。当前选择的狗狗「${dogName}」为${dogLifeStageText}，建议确认后再继续。`;
}

/**
 * 把「顾客已知晓生命阶段不匹配、仍继续」这件事记到后端，作为凭证。
 *
 * 失败不打扰顾客（只记 console）—— 记录失败不该阻断下单，
 * 但绝不能因此就不记录：调用方必须 await 它再继续。
 */
export async function recordLifeStageAcknowledgement(params: {
  recipeId: string;
  dogId: string;
  verdict: LifeStageMatchVerdict | null;
  source: 'order' | 'diy' | 'diy_sheet';
}): Promise<boolean> {
  const recipeId = String(params.recipeId || '').trim();
  const dogId = String(params.dogId || '').trim();
  if (!recipeId || !dogId) return false;

  try {
    const res = await request({
      url: `/recipes/${recipeId}/life-stage-acknowledgement`,
      method: 'POST',
      data: {
        dogId,
        matchType: params.verdict?.matchType || 'UNKNOWN',
        dogLifeStage: params.verdict?.dogLifeStage || undefined,
        recipeLifeStage: params.verdict?.selectedLifeStage || undefined,
        source: params.source,
      },
      quiet: true,
      suppressErrorToast: true,
    } as any);
    return Boolean(res && res.code === 0);
  } catch (error) {
    console.warn('[LifeStage] record acknowledgement failed:', error);
    return false;
  }
}

/**
 * 弹一次「生命阶段不匹配」的确认框，顾客确认后**留痕**。
 *
 * 关键设计：**每次调用都会弹**，不因为顾客之前点过"我已知晓"就跳过。
 * 顾客可能今天按自己的判断下单、下周换一只狗又来买，
 * 每一次都是独立的一次告知 —— 多提醒一次的成本，远低于没提醒到的风险。
 *
 * @returns 顾客是否确认继续
 */
export async function confirmLifeStageMismatch(params: {
  recipeId: string;
  dogId: string;
  verdict: LifeStageMatchVerdict | null;
  source: 'order' | 'diy' | 'diy_sheet';
  dogName?: string;
}): Promise<boolean> {
  const content =
    params.verdict?.message ||
    `当前狗狗的生命阶段与这份食谱的适用阶段不一致${
      params.dogName ? `（${params.dogName}）` : ''
    }。`;

  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '生命阶段提醒',
      content: `${content}\n\n继续表示您已知晓并自行决定；如狗狗有明确诊断或正在遵医嘱饮食，请先咨询执业兽医。`,
      confirmText: '我已知晓，继续',
      cancelText: '再看看',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });

  if (!confirmed) return false;

  // 留痕：顾客确认后立即记录，作为"已明确告知"的凭证
  await recordLifeStageAcknowledgement({
    recipeId: params.recipeId,
    dogId: params.dogId,
    verdict: params.verdict,
    source: params.source,
  });

  return true;
}
