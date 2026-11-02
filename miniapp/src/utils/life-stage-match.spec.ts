import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  request: vi.fn(),
}));

import { request } from './api';
import {
  buildLifeStageReminderText,
  fetchLifeStageMatch,
  formatLifeStageList,
  getLifeStageLabel,
  isLifeStageMismatch,
} from './life-stage-match';

const mockedRequest = request as unknown as ReturnType<typeof vi.fn>;

/**
 * 2026-09-19 重构：生命阶段判定改由后端给出，前端只负责展示。
 *
 * 因此这里**不再测试"前端怎么算"**（那套实现已被删除），只测试：
 *   · 后端结论怎么判读（哪些算"不匹配"）
 *   · 拿不到结论时会不会退化成"静默放行"（关键回归点）
 *   · 展示用的中文名与兜底文案
 */
describe('life-stage verdict interpretation', () => {
  it('treats mismatch types as needing a warning', () => {
    expect(isLifeStageMismatch('MANUAL_MISMATCH')).toBe(true);
    expect(isLifeStageMismatch('FALLBACK_ADULT')).toBe(true);
    expect(isLifeStageMismatch('FALLBACK_FIRST')).toBe(true);
  });

  it('does not warn on matched or legacy (single-version) recipes', () => {
    expect(isLifeStageMismatch('MATCHED')).toBe(false);
    // LEGACY 表示这张食谱本来就没有生命阶段版本之分，不存在"不匹配"
    expect(isLifeStageMismatch('LEGACY')).toBe(false);
  });

  it('treats a missing verdict as not-a-mismatch rather than inventing one', () => {
    expect(isLifeStageMismatch(null)).toBe(false);
    expect(isLifeStageMismatch(undefined)).toBe(false);
    expect(isLifeStageMismatch('')).toBe(false);
    expect(isLifeStageMismatch('SOME_FUTURE_TYPE')).toBe(false);
  });
});

describe('fetchLifeStageMatch', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
  });

  it('asks the backend for the verdict instead of computing locally', async () => {
    mockedRequest.mockResolvedValue({
      code: 0,
      data: { matchType: 'MATCHED', dogLifeStage: 'PUPPY_14_WEEKS_PLUS' },
    });

    const verdict = await fetchLifeStageMatch({
      recipeId: 'series-1',
      dogId: 'dog-1',
      lifeStage: 'HIGH_ACTIVITY_ADULT',
    });

    expect(verdict?.matchType).toBe('MATCHED');
    expect(verdict?.dogLifeStage).toBe('PUPPY_14_WEEKS_PLUS');
    expect(mockedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/recipes/series-1/life-stage-match',
        method: 'GET',
        data: { dogId: 'dog-1', lifeStage: 'HIGH_ACTIVITY_ADULT' },
      }),
    );
  });

  it('omits blank query params', async () => {
    mockedRequest.mockResolvedValue({ code: 0, data: { matchType: 'LEGACY' } });

    await fetchLifeStageMatch({ recipeId: 'r1', dogId: '', lifeStage: null });

    expect(mockedRequest).toHaveBeenCalledWith(
      expect.objectContaining({ data: {} }),
    );
  });

  it('returns null (not a silent "matched") when the request fails', async () => {
    mockedRequest.mockRejectedValue(new Error('network down'));

    await expect(
      fetchLifeStageMatch({ recipeId: 'r1', dogId: 'dog-1' }),
    ).resolves.toBeNull();
  });

  it('returns null when the backend answers with an error code', async () => {
    mockedRequest.mockResolvedValue({ code: 500, message: 'boom' });

    await expect(
      fetchLifeStageMatch({ recipeId: 'r1', dogId: 'dog-1' }),
    ).resolves.toBeNull();
  });

  it('does not call the backend without a recipe id', async () => {
    await expect(fetchLifeStageMatch({ recipeId: '' })).resolves.toBeNull();
    expect(mockedRequest).not.toHaveBeenCalled();
  });
});

describe('life-stage display helpers', () => {
  it('labels every recipe and profile life stage', () => {
    expect(getLifeStageLabel('PUPPY_UNDER_14_WEEKS')).toBe('幼犬版（14 周内）');
    expect(getLifeStageLabel('PUPPY_14_WEEKS_PLUS')).toBe('幼犬版（14 周以上）');
    expect(getLifeStageLabel('LOW_ACTIVITY_ADULT_OR_SENIOR')).toBe('低活动成犬 / 老年版');
    expect(getLifeStageLabel('HIGH_ACTIVITY_ADULT')).toBe('成犬版');
    expect(getLifeStageLabel('REPRODUCTION')).toBe('繁殖期版');
    expect(getLifeStageLabel('PUPPY')).toBe('幼犬期');
    expect(getLifeStageLabel('ADULT')).toBe('成犬期');
    expect(getLifeStageLabel('SENIOR')).toBe('老年犬期');
    expect(getLifeStageLabel('PREGNANCY')).toBe('妊娠期');
    expect(getLifeStageLabel('LACTATION')).toBe('哺乳期');
  });

  it('formats an applicable stage list, normalizing case and blanks', () => {
    expect(formatLifeStageList([' adult ', '', null, 'senior'])).toBe(
      '成犬期、老年犬期',
    );
    expect(formatLifeStageList(null)).toBe('');
  });

  it('builds reminder copy from the backend-provided dog stage', () => {
    expect(
      buildLifeStageReminderText({
        applicableStages: ['HIGH_ACTIVITY_ADULT'],
        dogLifeStage: 'PUPPY_14_WEEKS_PLUS',
        dogName: '敢敢',
      }),
    ).toBe(
      '该食谱适用于：成犬版。当前选择的狗狗「敢敢」为幼犬版（14 周以上），建议确认后再继续。',
    );
  });

  it('says 未知 when the backend could not resolve a stage', () => {
    expect(
      buildLifeStageReminderText({
        applicableStages: ['HIGH_ACTIVITY_ADULT'],
        dogLifeStage: null,
        dogName: '敢敢',
      }),
    ).toContain('为未知');
  });

  it('explains when the recipe configures no applicable stage', () => {
    expect(
      buildLifeStageReminderText({
        applicableStages: [],
        dogLifeStage: 'ADULT',
      }),
    ).toContain('尚未配置适用生命阶段');
  });
});

describe('confirmLifeStageMismatch · 高风险确认文案', () => {
  it('用风险说明与 4 字按钮，且不下发系统词', async () => {
    const { confirmLifeStageMismatch } = await import('./life-stage-match');
    const showModal = vi.fn((options: any) => options.success({ confirm: false }));
    ;(globalThis as any).uni = { showModal };

    const confirmed = await confirmLifeStageMismatch({
      recipeId: 'recipe-1',
      dogId: 'dog-1',
      verdict: {
        matchType: 'FALLBACK_ADULT',
        riskLevel: 'HIGH',
        selectedLifeStage: 'HIGH_ACTIVITY_ADULT',
        dogLifeStage: 'PUPPY_14_WEEKS_PLUS',
      },
      source: 'order',
      dogName: '旺财',
      dogAgeText: '3个月',
      dogStage: 'PUPPY_14_WEEKS_PLUS',
      currentVersionLabel: '成犬版',
    });

    expect(confirmed).toBe(false);
    const options = showModal.mock.calls[0][0];
    expect(options.content).toContain('钙磷比例');
    expect(options.content).toContain('成犬版');
    expect(options.content).not.toContain('没有完全匹配');
    expect(options.content).not.toContain('手动展示');
    expect(options.confirmText.length).toBeLessThanOrEqual(4);
    expect(options.cancelText).toBe('看合适版');
  });
});
