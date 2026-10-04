import {
  CHALLENGE_RULES,
  ELIMINATION_DIRECTIONS,
  STRICT_RULES,
  VET_BOUNDARY_NOTES,
  getDurationAdvice,
  resolveDayIndex,
  resolvePlannedEndDate,
  summarizeTrialTrend,
} from 'src/domain/health/elimination-trial';

/**
 * 排除性饮食试验的规则表（2026-10-04，过敏重构第三期）
 *
 * 老板第 2 条："对于很多需要做过敏排查的用户来说，
 * 可以创建过敏原的排查计划。"
 *
 * 这些数字**都带出处**（SACN5 第 31 章），不是拍的：
 *   皮肤 6～12 周、胃肠道 2～4 周、慢性外耳炎可能 4～6 个月。
 * 这组测试锁住它们 —— 改动数字必须同时改依据，
 * 否则界面会给顾客一个没有出处的建议。
 */

describe('elimination trial rules', () => {
  describe('getDurationAdvice —— 建议时长必须带出处', () => {
    it('皮肤方向：6～12 周（42～84 天）', () => {
      const advice = getDurationAdvice('SKIN');
      expect(advice.minDays).toBe(42);
      expect(advice.maxDays).toBe(84);
      expect(advice.basis).toContain('第 31 章');
    });

    it('胃肠道方向：2～4 周（14～28 天）', () => {
      const advice = getDurationAdvice('GI');
      expect(advice.minDays).toBe(14);
      expect(advice.maxDays).toBe(28);
    });

    it('皮肤 + 肠胃同时有：按更长的那个走，避免时间太短而误判', () => {
      expect(getDurationAdvice('BOTH').minDays).toBe(42);
    });

    it('慢性外耳炎：可能需要 4～6 个月', () => {
      const advice = getDurationAdvice('OTITIS');
      expect(advice.minDays).toBe(120);
      expect(advice.expectation).toContain('4～6 个月');
    });

    it('每个方向都必须给"改善要多久才看得出来" —— 否则顾客两周没变化就放弃了', () => {
      for (const direction of ELIMINATION_DIRECTIONS) {
        const advice = getDurationAdvice(direction.value);
        expect(advice.expectation.length).toBeGreaterThan(0);
        expect(advice.basis.length).toBeGreaterThan(0);
      }
    });

    it('方向非法时退回皮肤方向（更保守），而不是报错或给 0 天', () => {
      expect(getDurationAdvice(null).minDays).toBe(42);
      expect(getDurationAdvice('乱写的').minDays).toBe(42);
    });
  });

  describe('STRICT_RULES —— 必守清单来自指南原文', () => {
    it('覆盖 skin-004 列举的全部禁止项', () => {
      const keys = STRICT_RULES.map((rule) => rule.key);
      // 指南原文：零食、调味维生素补充剂、可咀嚼药物、
      // 脂肪酸补充剂、咀嚼玩具、其它宠物的粮
      expect(keys).toContain('noTreats');
      expect(keys).toContain('noFlavoredSupplements');
      expect(keys).toContain('noChewableMeds');
      expect(keys).toContain('noChews');
      expect(keys).toContain('noOtherPetsFood');
      // 指南建议记饮食日记
      expect(keys).toContain('dietDiary');
    });

    it('每条都有 detail —— 只给标题顾客不知道具体怎么做', () => {
      for (const rule of STRICT_RULES) {
        expect(rule.label.length).toBeGreaterThan(0);
        expect(rule.detail.length).toBeGreaterThan(0);
      }
    });
  });

  describe('CHALLENGE_RULES —— 再挑战的观察窗口', () => {
    it('观察窗口 7～14 天（症状可能延迟到 14 天才出现）', () => {
      expect(CHALLENGE_RULES.minObserveDays).toBe(7);
      expect(CHALLENGE_RULES.maxObserveDays).toBe(14);
    });

    it('必须带上"不做再挑战会过度诊断"的警告', () => {
      // skin-003 原文：不进行激发试验会导致食物敏感性被明显过度诊断。
      // 少做这一步，会把很多其实不过敏的食物误判成过敏。
      expect(CHALLENGE_RULES.warning).toContain('过度诊断');
    });
  });

  describe('VET_BOUNDARY_NOTES —— 两条必须原样传达的安全提示', () => {
    it('包含"必须由兽医设计与监督"', () => {
      expect(VET_BOUNDARY_NOTES.join('')).toContain('兽医设计并监督');
    });

    it('包含"皮试 / 血清 IgE 不能确诊"', () => {
      // skin-003 caveat：皮试、血清 IgE/RAST、ELISA 对食物不良反应
      // 既不适用于筛查也不能确诊。
      const text = VET_BOUNDARY_NOTES.join('');
      expect(text).toContain('血清');
      expect(text).toContain('不能确诊');
    });
  });

  describe('resolvePlannedEndDate / resolveDayIndex', () => {
    it('按开始日期与天数算结束日', () => {
      const start = new Date(Date.UTC(2026, 2, 1));
      expect(resolvePlannedEndDate(start, 42).toISOString().slice(0, 10)).toBe(
        '2026-04-12',
      );
    });

    it('开始当天算第 1 天', () => {
      const start = new Date(Date.UTC(2026, 2, 1));
      const sameDay = new Date(Date.UTC(2026, 2, 1));
      expect(resolveDayIndex(start, sameDay)).toBe(1);
    });

    it('跨月也能算对', () => {
      const start = new Date(Date.UTC(2026, 2, 28));
      const later = new Date(Date.UTC(2026, 3, 2));
      expect(resolveDayIndex(start, later)).toBe(6);
    });
  });

  describe('summarizeTrialTrend —— 趋势', () => {
    const makeLogs = (values: number[]) =>
      values.map((value, index) => ({
        logDate: new Date(Date.UTC(2026, 2, index + 1)),
        itchScore: value,
        stoolScore: null,
      }));

    it('样本不足 4 个点时不给结论 —— 宁可不说，也不编一个假趋势', () => {
      expect(summarizeTrialTrend(makeLogs([3, 2, 1]), 'itchScore')).toBeNull();
    });

    it('持续下降判为好转', () => {
      const trend = summarizeTrialTrend(
        makeLogs([3, 3, 3, 1, 1, 1]),
        'itchScore',
      );
      expect(trend?.direction).toBe('improving');
    });

    it('持续上升判为变差', () => {
      const trend = summarizeTrialTrend(
        makeLogs([1, 1, 1, 3, 3, 3]),
        'itchScore',
      );
      expect(trend?.direction).toBe('worsening');
    });

    it('小幅波动算稳定 —— 不把正常波动说成好转', () => {
      const trend = summarizeTrialTrend(
        makeLogs([2, 2, 2, 2, 2, 2]),
        'itchScore',
      );
      expect(trend?.direction).toBe('stable');
    });

    it('没记过的项目不参与统计', () => {
      const logs = makeLogs([1, 1, 1, 1]).map((log) => ({
        ...log,
        itchScore: null,
      }));
      expect(summarizeTrialTrend(logs, 'itchScore')).toBeNull();
    });
  });
});
