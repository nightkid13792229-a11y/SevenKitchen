import { buildVaccinePlan, toDateText } from '../../../src/domain/health/immunization-schedule';

const BIRTH = new Date('2026-01-05T00:00:00');
const atWeek = (w: number) => toDateText(new Date(BIRTH.getTime() + w * 7 * 86400000));

describe('__tmp SKIP 细节', () => {
  it('打印', () => {
    const plan = buildVaccinePlan({
      dogId: 'd',
      birthday: '2026-01-05',
      records: [
        { id: 'r1', vaccineName: '狂犬', vaccinationDate: atWeek(12), nextDueDate: null },
        { id: 'r2', vaccineName: '狂犬', vaccinationDate: atWeek(64), nextDueDate: null },
      ],
      decisions: { 'rabies-2': 'SKIP' },
      today: new Date('2027-06-01T00:00:00'),
    });
    // eslint-disable-next-line no-console
    console.log(`打了两针狂犬：第 12 周（${atWeek(12)}）和第 64 周（${atWeek(64)}）`);
    // eslint-disable-next-line no-console
    console.log(
      plan.steps
        .filter((s) => s.kind === 'rabies')
        .map((s) => `  [${s.status.padEnd(8)}] ${s.key.padEnd(10)} 窗口 ${s.windowStart}~${s.windowEnd}｜命中 ${s.matchedRecordDate || '—'}`)
        .join('\n'),
    );
    expect(true).toBe(true);
  });
});
