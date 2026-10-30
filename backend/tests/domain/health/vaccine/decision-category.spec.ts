import { buildPlanView } from '../../../../src/domain/health/vaccine/engine';

/**
 * 四块地基 #2：决定贴**类别**，不再贴会漂移的 stepKey（2026-10-30）。
 *
 * 这一组只钉纯函数行为：
 *   · NOT_NOW = 整类推迟到 `snoozeUntil`；到期后回来；
 *   · STOPPED = 整类长期隐藏；
 *   · `ignored` 按类别计数（一个类别只出一行）。
 */
describe('决定贴类别 · 30 天推迟（#2）', () => {
  const TODAY = new Date('2026-10-30T00:00:00');
  /** 8.7 周：核心首免系列正开着 */
  const BIRTHDAY = '2026-08-30';

  const build = (decisions: Record<string, any> = {}) =>
    buildPlanView({
      dogId: 'dog-1',
      birthday: BIRTHDAY,
      records: [],
      decisions,
      today: TODAY,
    });

  it('核心 NOT_NOW 到 2026-11-29：整类消失，只算 1 项', () => {
    const view = build({
      core: {
        decision: 'SKIP',
        reason: 'NOT_NOW',
        snoozeUntil: '2026-11-29',
      },
    });

    expect(view.plan.some((step) => step.kind === 'core')).toBe(false);
    expect(view.ignored.count).toBe(1);
    expect(view.ignored.items[0]).toMatchObject({
      reason: 'NOT_NOW',
      snoozeUntil: '2026-11-29',
    });
  });

  it('推迟到期（2026-10-29）后核心回来', () => {
    const view = build({
      core: {
        decision: 'SKIP',
        reason: 'NOT_NOW',
        snoozeUntil: '2026-10-29',
      },
    });

    expect(view.plan.some((step) => step.kind === 'core')).toBe(true);
    expect(view.ignored.count).toBe(0);
  });

  it('STOPPED 长期隐藏；删掉决定就回来', () => {
    const stopped = build({
      core: { decision: 'SKIP', reason: 'STOPPED' },
    });
    expect(stopped.plan.some((step) => step.kind === 'core')).toBe(false);
    expect(stopped.ignored.count).toBe(1);

    const restored = build({});
    expect(restored.plan.some((step) => step.kind === 'core')).toBe(true);
  });

  it('旧 stepKey 决定仍然兼容（迁移前/回滚时）', () => {
    const view = build({
      'core-puppy-1': {
        decision: 'SKIP',
        reason: 'NOT_NOW',
        snoozeUntil: '2026-11-29',
      },
    });

    // 旧键只跳过命中的那一步；这是兼容路径，新数据一律用类别。
    expect(view.ignored.count).toBe(1);
    expect(view.ignored.items[0].reason).toBe('NOT_NOW');
  });
});
