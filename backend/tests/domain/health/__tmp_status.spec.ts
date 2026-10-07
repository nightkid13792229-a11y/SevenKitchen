import { buildVaccinePlan, toDateText } from '../../../src/domain/health/immunization-schedule';

const BIRTH = new Date('2026-01-05T00:00:00');
const atWeek = (w: number) => toDateText(new Date(BIRTH.getTime() + w * 7 * 86400000));

describe('__tmp 状态与决定', () => {
  it('打印', () => {
    // 狂犬首针打了（12 周龄），但顾客对"第 3 次"点过"不做"/"推迟"
    for (const decision of ['SKIP', 'DEFER', 'ACCEPT']) {
      const plan = buildVaccinePlan({
        dogId: 'd',
        birthday: '2026-01-05',
        records: [
          { id: 'r1', vaccineName: '狂犬', vaccinationDate: atWeek(12), nextDueDate: null },
        ],
        decisions: { 'rabies-3': decision as never },
        today: new Date('2026-10-08T00:00:00'),
      });
      const third = plan.steps.find((s) => s.key === 'rabies-3');
      // eslint-disable-next-line no-console
      console.log(
        `决定 ${decision.padEnd(6)} → 狂犬第3次：${third ? `[${third.status}] ${third.reminder}` : '（被过滤掉不显示）'}`,
      );
    }

    // 顾客对某一步点了"不做"，但后来真的打了那一针（记录顶上了这一步）
    const plan = buildVaccinePlan({
      dogId: 'd',
      birthday: '2026-01-05',
      records: [
        { id: 'r1', vaccineName: '狂犬', vaccinationDate: atWeek(12), nextDueDate: null },
        { id: 'r2', vaccineName: '狂犬', vaccinationDate: atWeek(64), nextDueDate: null },
      ],
      decisions: { 'rabies-2': 'SKIP' },
      today: new Date('2026-10-08T00:00:00'),
    });
    const second = plan.steps.find((s) => s.key === 'rabies-2');
    // eslint-disable-next-line no-console
    console.log(
      `\n顾客说"不做"，但 64 周龄真打了那一针 → 狂犬第2次：[${second?.status}] 命中 ${second?.matchedRecordDate || '—'}`,
    );
    expect(true).toBe(true);
  });
});
