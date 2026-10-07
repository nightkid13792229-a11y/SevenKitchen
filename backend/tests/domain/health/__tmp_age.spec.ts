import { buildVaccinePlan } from '../../../src/domain/health/immunization-schedule';

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = new Date('2026-10-07T00:00:00');
/** 今天往前推 N 周的生日 —— 这样"无记录"的狗就等于"N 周龄才开始首免" */
const bornWeeksAgo = (weeks: number) =>
  fmt(new Date(TODAY.getTime() - weeks * 7 * 86400000));
/** 生日固定 2026-01-05 的狗，第 N 周龄那天 */
const BIRTH = new Date('2026-01-05T00:00:00');
const atWeek = (w: number) => fmt(new Date(BIRTH.getTime() + w * 7 * 86400000));
const rec = (id: string, name: string, date: string, kinds?: string[]) =>
  ({ id, vaccineName: name, vaccinationDate: date, nextDueDate: null, ...(kinds ? { kinds } : {}) }) as never;

const show = (title: string, plan: ReturnType<typeof buildVaccinePlan>) => {
  // eslint-disable-next-line no-console
  console.log(
    `【${title}】\n` +
      plan.steps
        .filter((s) => s.kind === 'core' && (s.status !== 'DONE' || /puppy|26w|adult/.test(s.key)))
        .map((s) => `    [${s.status.padEnd(8)}] ${s.key.padEnd(14)} ${s.label}`)
        .join('\n'),
  );
};

describe('__tmp 年龄裁剪矩阵', () => {
  it('打印', () => {
    for (const weeks of [8, 20, 26, 40]) {
      show(
        `无记录，今天正好 ${weeks} 周龄`,
        buildVaccinePlan({ dogId: 'd', birthday: bornWeeksAgo(weeks), records: [], today: TODAY }),
      );
    }

    // 第一针正好 16 周 / 正好 26 周 / 15 周（不裁）
    for (const firstWeek of [15, 16, 26]) {
      show(
        `第一针核心苗打在 ${firstWeek} 周龄（生日 2026-01-05）`,
        buildVaccinePlan({
          dogId: 'd',
          birthday: '2026-01-05',
          records: [rec('a', '卫佳伍', atWeek(firstWeek))],
          today: new Date('2027-01-01T00:00:00'),
        }),
      );
    }

    // 幼犬保（早期核心苗）5 周 + 正常核心苗 20 周：还算不算"≥16 周才开始"？
    show(
      '幼犬保 5 周 + 卫佳伍 20 周',
      buildVaccinePlan({
        dogId: 'd',
        birthday: '2026-01-05',
        records: [rec('a', '宠必威幼犬保', atWeek(5)), rec('b', '卫佳伍', atWeek(20))],
        today: new Date('2026-09-01T00:00:00'),
      }),
    );
    expect(true).toBe(true);
  });
});
