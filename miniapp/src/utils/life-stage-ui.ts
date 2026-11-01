/**
 * 生命阶段版本条 · 八态与文案（2026-11-02）
 *
 * 页面只负责"什么时候调"，文案与状态一律在这里定：
 * 三页（详情/订购/DIY）共用同一套说法，避免各写一遍又走样。
 * 文案禁用词见设计稿 §5：「不匹配」「没有完全匹配版本」「手动展示」。
 */

import { getLifeStageLabel } from './label-mapping';
import type { LifeStageMatchVerdict } from './life-stage-match';

export type LifeStageUiState =
  | 'no_dog'
  | 'unknown'
  | 'matched'
  | 'manual_low'
  | 'manual_high'
  | 'fallback_low'
  | 'fallback_high'
  | 'legacy';

export function resolveLifeStageUiState(input: {
  hasDog: boolean;
  verdict?: LifeStageMatchVerdict | null;
}): LifeStageUiState {
  if (!input.hasDog) return 'no_dog';
  const verdict = input.verdict;
  if (!verdict) return 'unknown';
  switch (verdict.matchType) {
    case 'LEGACY':
      return 'legacy';
    case 'NO_DOG':
      return 'no_dog';
    case 'MATCHED':
      return 'matched';
    case 'MANUAL_MISMATCH':
      return verdict.riskLevel === 'HIGH' ? 'manual_high' : 'manual_low';
    case 'FALLBACK_ADULT':
    case 'FALLBACK_FIRST':
      return verdict.riskLevel === 'HIGH' ? 'fallback_high' : 'fallback_low';
    default:
      return 'unknown';
  }
}

export type LifeStageBarAction =
  | 'switch'
  | 'restore'
  | 'suitable'
  | 'retry'
  | 'add_dog'
  | 'none';

export interface LifeStageBarCopy {
  title: string;
  subtitle: string;
  action: LifeStageBarAction;
  actionLabel: string;
}

export interface LifeStageBarContext {
  dogName?: string | null;
  dogAgeText?: string | null;
  dogStage?: string | null;
  dogStageLabel?: string | null;
  currentLabel?: string | null;
  suggestedLabel?: string | null;
  versionCount?: number;
}

function stageWord(dogStage?: string | null): string {
  if (dogStage === 'REPRODUCTION') return '繁殖期';
  if (dogStage === 'PUPPY_UNDER_14_WEEKS' || dogStage === 'PUPPY_14_WEEKS_PLUS') {
    return '幼犬期';
  }
  return '这个阶段';
}

export function buildLifeStageBarCopy(
  state: LifeStageUiState,
  ctx: LifeStageBarContext = {},
): LifeStageBarCopy {
  const dog = (ctx.dogName || '').trim() || '当前爱犬';
  const current = (ctx.currentLabel || '').trim() || '当前版本';
  const suggested = (ctx.suggestedLabel || '').trim();
  const dogStageLabel = (ctx.dogStageLabel || '').trim() || stageWord(ctx.dogStage);
  const age = (ctx.dogAgeText || '').trim();

  switch (state) {
    case 'matched':
      return {
        title: current,
        subtitle: `${dog}${age ? ` ${age}` : ''} · 按档案匹配`,
        action: (ctx.versionCount ?? 0) > 1 ? 'switch' : 'none',
        actionLabel: (ctx.versionCount ?? 0) > 1 ? '换一版 ›' : '',
      };
    case 'manual_low':
      return {
        title: current,
        subtitle: `当前不是按${dog}档案匹配的版本`,
        action: 'restore',
        actionLabel: suggested ? `恢复为${suggested}` : '恢复匹配版本',
      };
    case 'manual_high':
      return {
        title: current,
        subtitle: `${dog}还在${stageWord(ctx.dogStage)}，这一版不是给它的`,
        action: 'switch',
        actionLabel: '换合适版',
      };
    case 'fallback_low':
      return {
        title: current,
        subtitle: `这道菜没有适合${dog}（${dogStageLabel}）的版本，现展示这一版`,
        action: 'suitable',
        actionLabel: '看看适合的菜',
      };
    case 'fallback_high':
      return {
        title: current,
        subtitle: `这道菜没有适合${dog}（${dogStageLabel}）的版本，幼犬配方与成犬不同`,
        action: 'suitable',
        actionLabel: '看看幼犬的菜',
      };
    case 'unknown':
      return {
        title: '暂时无法确认',
        subtitle: `这份食谱是否适合${dog}，稍后再试`,
        action: 'retry',
        actionLabel: '重试',
      };
    case 'no_dog':
      return {
        title: '还没选择爱犬',
        subtitle: '添加后自动匹配适合的版本',
        action: 'add_dog',
        actionLabel: '去添加',
      };
    case 'legacy':
    default:
      return { title: '', subtitle: '', action: 'none', actionLabel: '' };
  }
}

export function buildRiskConfirmCopy(ctx: {
  dogName: string;
  dogAgeText?: string;
  currentVersionLabel: string;
  dogStage?: string | null;
}): { title: string; content: string; confirmText: string; cancelText: string } {
  const repro = ctx.dogStage === 'REPRODUCTION';
  const stageText = repro ? '繁殖期' : '幼犬期';
  const riskText = repro
    ? '繁殖期的能量与营养需求明显更高，这一版不是按这个阶段配的。'
    : '幼犬与成犬的钙磷比例、能量密度不同，长期喂可能影响骨骼发育。';
  const age = (ctx.dogAgeText || '').trim();
  return {
    title: '生命阶段提醒',
    content: `${ctx.dogName}${age ? ` ${age}` : ''}，属于${stageText}；这份是「${ctx.currentVersionLabel}」。\n${riskText}\n继续表示您已知晓并自行决定；如正在遵医嘱，请先咨询执业兽医。`,
    confirmText: '仍要继续',
    cancelText: '看合适版',
  };
}

const VERSION_OPTION_SUBTITLE: Record<string, string> = {
  PUPPY_UNDER_14_WEEKS: '断奶后到 14 周',
  PUPPY_14_WEEKS_PLUS: '14 周以上、尚未成年',
  HIGH_ACTIVITY_ADULT: '成年、活动量正常或偏高',
  LOW_ACTIVITY_ADULT_OR_SENIOR: '活动量偏低，或已进入老年',
  REPRODUCTION: '妊娠或哺乳期',
};

export function buildVersionOptionSubtitle(lifeStage: string): string {
  return VERSION_OPTION_SUBTITLE[lifeStage] || '';
}

export function buildVersionOptionLabel(lifeStage: string): string {
  return getLifeStageLabel(lifeStage);
}
