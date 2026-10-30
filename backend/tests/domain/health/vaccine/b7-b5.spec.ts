import {
  addWeeks,
  buildPlanView,
  matchRecords,
  materializeSteps,
  toDateText,
} from '../../../../src/domain/health/vaccine/engine';
import { toStepDto } from '../../../../src/domain/health/vaccine/plan-view';
import {
  LEPTO_SCHEDULE,
  RABIES_SCHEDULE,
} from '../../../../src/domain/health/vaccine/schedule-table';

/**
 * F-C · B7（实际接种日下发）+ B5（狂犬 36 个月 / 钩端“部分地区”文案）
 * 2026-10-30
 */
describe('B7 · 已完成步骤下发实际接种日', () => {
  it('DONE 的步骤带 matchedRecordDate = 记录上的日期，不是计划日', () => {
    const birthday = new Date('2026-05-01T00:00:00');
    const today = addWeeks(birthday, 20);
    const actual = addWeeks(birthday, 17);
    const records = [
      {
        id: 'r1',
        vaccineName: '卫佳伍',
        vaccinationDate: toDateText(actual),
        productVerified: true,
      },
    ];
    const steps = matchRecords(
      materializeSteps({ birthday, records, today }),
      records,
      { today },
    );
    const done = steps.find(
      (step) => step.kind === 'core' && step.matchedRecordDate !== null,
    );
    expect(done).toBeDefined();

    const dto = toStepDto(done!, { weeksAtStep: 17 });
    expect(dto.status).toBe('DONE');
    expect(dto.matchedRecordDate).toBe(toDateText(actual));
    expect(dto.windowStart).not.toBe(toDateText(actual)); // 计划窗口 ≠ 实际日期
  });

  it('buildPlanView 的 plan 也带这个字段（早期核心那一行是 DONE）', () => {
    const birthday = new Date('2026-05-01T00:00:00');
    const today = addWeeks(birthday, 20);
    const early = toDateText(addWeeks(birthday, 4));
    const view = buildPlanView({
      dogId: 'dog-1',
      birthday: toDateText(birthday),
      today,
      records: [
        {
          id: 'r1',
          vaccineName: '宠必威幼犬保',
          vaccinationDate: early,
          productVerified: true,
        },
      ],
    });
    const done = view.plan.find(
      (step) => step.kind === 'core_early' && step.status === 'DONE',
    );
    expect(done).toBeDefined();
    expect(done!.matchedRecordDate).toBe(early);
  });
});

describe('B5 · 狂犬 36 个月 / 钩端“部分地区”', () => {
  it('狂犬：保留每年提醒，说明 36 个月是说明书免疫期', () => {
    expect(RABIES_SCHEDULE.basis).toContain('36 个月');
    expect(RABIES_SCHEDULE.basis).toContain('本程序仍按每年');
  });

  it('钩端：改成“我国部分地区”，不再说全国都是流行地区', () => {
    expect(LEPTO_SCHEDULE.basis).toContain('我国部分地区');
    expect(LEPTO_SCHEDULE.basis).not.toContain('中国属钩端螺旋体流行地区');
  });
});
