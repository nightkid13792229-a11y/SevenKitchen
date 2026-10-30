import { buildPlanView } from '../../../../src/domain/health/vaccine/engine';

/**
 * B4 · V5（钩端旧第 2 针盖住重启第 2 针）+ V10（太早记录没有解释）
 * 2026-10-30
 */
describe('B4 · V5 钩端重启 / V10 太早记录', () => {
  it('V5：2023/09 首针 → 2025/06 重启第 1 针（16 个月后再看）→ 显示重启第 2 针', () => {
    const view = buildPlanView({
      dogId: 'dog-1',
      birthday: '2020-01-01',
      records: [
        {
          id: 'r1',
          vaccineName: '卫佳捌',
          vaccinationDate: '2023-09-01',
        },
        {
          id: 'r2',
          vaccineName: '宠必威乐必妥',
          vaccinationDate: '2025-06-01',
        },
      ],
      today: new Date('2026-10-28T00:00:00'),
    });

    const lepto = view.plan.find((step) => step.kind === 'lepto');
    expect(lepto!.key).toBe('lepto-restart-2');
    expect(lepto!.label).toBe('重启免疫 第 2 针');
    expect(lepto!.status).toBe('OVERDUE');
    expect(lepto!.windowStart).toBe('2025-06-15');
    expect(lepto!.missedWindowStart).toBe('2025-06-15');
    expect(lepto!.missedWindowEnd).toBe('2025-06-29');
    // 不许再拿 2023 年那条没记录的第 2 针当门面
    expect(view.plan.some((step) => step.key === 'lepto-primary-2')).toBe(
      false,
    );
  });

  it('V5：补上重启第 2 针（2025/06/20）之后，年度从这一针重新起算', () => {
    const view = buildPlanView({
      dogId: 'dog-1',
      birthday: '2020-01-01',
      records: [
        { id: 'r1', vaccineName: '卫佳捌', vaccinationDate: '2023-09-01' },
        {
          id: 'r2',
          vaccineName: '宠必威乐必妥',
          vaccinationDate: '2025-06-01',
        },
        {
          id: 'r3',
          vaccineName: '宠必威乐必妥',
          vaccinationDate: '2025-06-20',
        },
      ],
      today: new Date('2026-10-28T00:00:00'),
    });

    const lepto = view.plan.find((step) => step.kind === 'lepto');
    expect(lepto!.key).toBe('lepto-repeat-1');
    expect(lepto!.label).toBe('每年一次');
    expect(lepto!.windowStart).toBe('2026-06-20');
  });

  it('V10：5 周核心 + 10 周狂犬 → 两条记录都有解释，计划不变', () => {
    const view = buildPlanView({
      dogId: 'dog-1',
      birthday: '2026-08-01',
      records: [
        {
          id: 'r1',
          vaccineName: '卫佳伍',
          vaccinationDate: '2026-09-05',
        },
        {
          id: 'r2',
          vaccineName: '狂犬疫苗',
          vaccinationDate: '2026-10-10',
        },
      ],
      today: new Date('2026-10-28T00:00:00'),
    });

    const coreConflict = view.conflicts.find(
      (item) => item.recordId === 'r1',
    );
    expect(coreConflict?.reason).toContain('6 周');
    expect(coreConflict?.suggestion).toContain('未把它计入核心首免');

    const rabiesConflict = view.conflicts.find(
      (item) => item.recordId === 'r2',
    );
    expect(rabiesConflict?.reason).toContain('12 周');
    expect(rabiesConflict?.suggestion).toContain('未把它计入狂犬首针');

    // 计划不变：两针都不算数，仍然提醒首针
    expect(view.plan.find((step) => step.kind === 'core')!.status).not.toBe(
      'DONE',
    );
    expect(view.plan.find((step) => step.kind === 'rabies')!.status).not.toBe(
      'DONE',
    );
  });

  it('V10：4 周龄那一针不报“早于建议起始周龄”（正规 4 周产品）', () => {
    const view = buildPlanView({
      dogId: 'dog-1',
      birthday: '2026-08-01',
      records: [
        {
          id: 'r1',
          vaccineName: '卫佳伍',
          vaccinationDate: '2026-08-29',
        },
      ],
      today: new Date('2026-10-28T00:00:00'),
    });
    expect(view.conflicts.some((item) => item.recordId === 'r1')).toBe(false);
  });
});
