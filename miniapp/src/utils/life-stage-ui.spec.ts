import {
  buildLifeStageBarCopy,
  buildRiskConfirmCopy,
  buildVersionOptionSubtitle,
  resolveLifeStageUiState,
} from './life-stage-ui';

describe('life-stage-ui', () => {
  it('没狗优先于任何结论', () => {
    expect(
      resolveLifeStageUiState({ hasDog: false, verdict: { matchType: 'FALLBACK_ADULT' } }),
    ).toBe('no_dog');
  });

  it('没结论是 unknown，LEGACY 是 legacy，NO_DOG 是 no_dog', () => {
    expect(resolveLifeStageUiState({ hasDog: true, verdict: null })).toBe('unknown');
    expect(resolveLifeStageUiState({ hasDog: true, verdict: { matchType: 'LEGACY' } })).toBe('legacy');
    expect(resolveLifeStageUiState({ hasDog: true, verdict: { matchType: 'NO_DOG' } })).toBe('no_dog');
  });

  it('手动不匹配按风险分两档', () => {
    expect(
      resolveLifeStageUiState({ hasDog: true, verdict: { matchType: 'MANUAL_MISMATCH', riskLevel: 'HIGH' } }),
    ).toBe('manual_high');
    expect(
      resolveLifeStageUiState({ hasDog: true, verdict: { matchType: 'MANUAL_MISMATCH', riskLevel: 'LOW' } }),
    ).toBe('manual_low');
  });

  it('回退按风险分两档', () => {
    expect(
      resolveLifeStageUiState({ hasDog: true, verdict: { matchType: 'FALLBACK_FIRST', riskLevel: 'HIGH' } }),
    ).toBe('fallback_high');
    expect(
      resolveLifeStageUiState({ hasDog: true, verdict: { matchType: 'FALLBACK_ADULT', riskLevel: 'LOW' } }),
    ).toBe('fallback_low');
  });

  it('版本条文案不含系统词', () => {
    const copy = buildLifeStageBarCopy('manual_low', {
      dogName: '旺财',
      currentLabel: '幼犬版（14 周以上）',
      suggestedLabel: '成犬版',
    });
    expect(copy.subtitle).toBe('当前不是按旺财档案匹配的版本');
    expect(copy.actionLabel).toBe('恢复为成犬版');
    expect(copy.subtitle).not.toContain('不匹配');
  });

  it('没有这一版时给出出路', () => {
    const copy = buildLifeStageBarCopy('fallback_high', {
      dogName: '旺财',
      dogStageLabel: '幼犬（14 周以上）',
      currentLabel: '成犬版',
    });
    expect(copy.subtitle).toContain('没有适合旺财');
    expect(copy.actionLabel).toBe('看看幼犬的菜');
  });

  it('确认弹窗按钮不超过 4 字，且点名当前版本', () => {
    const copy = buildRiskConfirmCopy({
      dogName: '旺财',
      dogAgeText: '3个月',
      currentVersionLabel: '成犬版',
    });
    expect(copy.confirmText.length).toBeLessThanOrEqual(4);
    expect(copy.cancelText.length).toBeLessThanOrEqual(4);
    expect(copy.content).toContain('成犬版');
    expect(copy.content).toContain('钙磷比例');
  });

  it('版本面板说明覆盖五个版本', () => {
    expect(buildVersionOptionSubtitle('PUPPY_UNDER_14_WEEKS')).toContain('14 周');
    expect(buildVersionOptionSubtitle('HIGH_ACTIVITY_ADULT')).toContain('成年');
    expect(buildVersionOptionSubtitle('UNKNOWN')).toBe('');
  });
});
