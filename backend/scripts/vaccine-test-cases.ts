/**
 * 疫苗板块 · 测试案例库（老板 2026-10-11 定的 13 个案例）
 *
 * 目的：把"不同月龄 + 不同接种史"下的**计划板块与记录板块**表现一次看全 ✓，
 * 老板先审核 ✓，通过之后再往生产库添加（这个文件**只做离线推演，不碰数据库** ✓）。
 *
 * 用法：cd backend && npx ts-node -T scripts/vaccine-test-cases.ts
 *
 * ── 两条约定 ─────────────────────────────────────────────────────────────
 * 1. 参考日 REF_TODAY = 2026-10-11：月龄按它倒推生日 ✓，
 *    针次日期也按"生日 + N 周"算 ✓ —— 这样每个案例的时间关系是确定的 ✓。
 * 2. 老板口语里的疫苗名 → 我们产品库里的登记名：
 *      「早期犬瘟细小疫苗」 → 宠必威幼犬保（core_early：4 周龄抢跑那一针）
 *      「4 联核心疫苗」     → 卫佳伍（core：犬瘟/细小/腺病毒2型/副流感）
 *      「6 联（带钩端）」    → 卫佳捌（core + lepto）
 *      「狂犬疫苗」         → 宠必威锐必威（rabies）
 *      「4 联加强针」       → 卫佳伍（同产品再打一次）
 *      钩端单独那支         → 优乐康（lepto）
 */

import { buildVaccinePlan } from '../src/domain/health/immunization-schedule';

const REF_TODAY = '2026-10-11';

/** 参考日往前推 N 周，得到生日（YYYY-MM-DD） */
function birthdayWeeksAgo(weeks: number): string {
  const t = new Date(`${REF_TODAY}T00:00:00Z`);
  const d = new Date(t.getTime() - weeks * 7 * 86400000);
  return d.toISOString().slice(0, 10);
}

/** 生日 + N 周 */
function weeksAfter(birthday: string, weeks: number): string {
  const d = new Date(`${birthday}T00:00:00Z`);
  return new Date(d.getTime() + weeks * 7 * 86400000).toISOString().slice(0, 10);
}

type CaseRecord = { weeks: number; product: string; kinds: string[] };
type Case = {
  no: number;
  name: string;
  ageWeeks: number;
  note: string;
  records: CaseRecord[];
};

const EARLY = ['core_early'];
const CORE = ['core'];
const CORE_LEPTO = ['core', 'lepto'];
const RABIES = ['rabies'];
const LEPTO = ['lepto'];

export const CASES: Case[] = [
  { no: 1, name: '3 周龄 · 无记录', ageWeeks: 3, note: '还没到任何一针的月龄', records: [] },
  {
    no: 2, name: '5 周龄 · 1 次早期犬瘟细小', ageWeeks: 5,
    note: '早期那一针打过了',
    records: [{ weeks: 4, product: '宠必威幼犬保', kinds: EARLY }],
  },
  {
    no: 3, name: '7 周龄 · 早期 + 1 次核心', ageWeeks: 7,
    note: '早期已交棒，核心首免开始了',
    records: [
      { weeks: 4, product: '宠必威幼犬保', kinds: EARLY },
      { weeks: 6, product: '卫佳伍', kinds: CORE },
    ],
  },
  {
    no: 4, name: '7 周龄 · 只打过 1 次核心（没打早期）', ageWeeks: 7,
    note: '漏了早期那一针，直接打核心',
    records: [{ weeks: 6, product: '卫佳伍', kinds: CORE }],
  },
  {
    no: 5, name: '10 周龄 · 2 次四联核心', ageWeeks: 10,
    note: '核心首免进行中',
    records: [
      { weeks: 6, product: '卫佳伍', kinds: CORE },
      { weeks: 9, product: '卫佳伍', kinds: CORE },
    ],
  },
  {
    no: 6, name: '10 周龄 · 1 次四联 + 1 次六联（带钩端）', ageWeeks: 10,
    note: '第二针换成了带钩端的',
    records: [
      { weeks: 6, product: '卫佳伍', kinds: CORE },
      { weeks: 9, product: '卫佳捌', kinds: CORE_LEPTO },
    ],
  },
  {
    no: 7, name: '15 周龄 · 1 次四联 + 2 次六联 + 1 次狂犬', ageWeeks: 15,
    note: '核心快收尾、狂犬已开针',
    records: [
      { weeks: 6, product: '卫佳伍', kinds: CORE },
      { weeks: 9, product: '卫佳捌', kinds: CORE_LEPTO },
      { weeks: 12, product: '卫佳捌', kinds: CORE_LEPTO },
      { weeks: 14, product: '宠必威锐必威', kinds: RABIES },
    ],
  },
  {
    no: 8, name: '18 周龄 · 1 次四联 + 3 次六联 + 1 次狂犬', ageWeeks: 18,
    note: '核心首免打完（16 周后那一针也在）',
    records: [
      { weeks: 6, product: '卫佳伍', kinds: CORE },
      { weeks: 9, product: '卫佳捌', kinds: CORE_LEPTO },
      { weeks: 12, product: '卫佳捌', kinds: CORE_LEPTO },
      { weeks: 16, product: '卫佳捌', kinds: CORE_LEPTO },
      { weeks: 17, product: '宠必威锐必威', kinds: RABIES },
    ],
  },
  {
    no: 9, name: '18 周龄 · 交替四联/六联 + 狂犬', ageWeeks: 18,
    note: '中途换回四联（老板原话：4联→6联→6联→4联）',
    records: [
      { weeks: 6, product: '卫佳伍', kinds: CORE },
      { weeks: 9, product: '卫佳捌', kinds: CORE_LEPTO },
      { weeks: 12, product: '卫佳捌', kinds: CORE_LEPTO },
      { weeks: 15, product: '卫佳伍', kinds: CORE },
      { weeks: 17, product: '宠必威锐必威', kinds: RABIES },
    ],
  },
  {
    no: 10, name: '26 周龄 · 全套 + 26 周加强', ageWeeks: 26,
    note: '26 周龄补强那一针打过了（这一针正是计划里那条"该补了"）',
    records: [
      { weeks: 6, product: '卫佳伍', kinds: CORE },
      { weeks: 9, product: '卫佳捌', kinds: CORE_LEPTO },
      { weeks: 12, product: '卫佳捌', kinds: CORE_LEPTO },
      { weeks: 17, product: '宠必威锐必威', kinds: RABIES },
      { weeks: 26, product: '卫佳伍', kinds: CORE },
    ],
  },
  { no: 11, name: '1 岁 · 无记录', ageWeeks: 52, note: '成年狗、一条记录都没有', records: [] },
  {
    no: 12, name: '1 岁 · 只有一次狂犬', ageWeeks: 52,
    note: '只打过狂犬，核心一条都没有',
    records: [{ weeks: 30, product: '宠必威锐必威', kinds: RABIES }],
  },
  {
    no: 13, name: '4 岁 · 完整首年 + 每年狂犬/钩端 + 快 4 岁重打四联', ageWeeks: 208,
    note: '最复杂：年度加强、中途重打核心',
    records: [
      { weeks: 6, product: '卫佳伍', kinds: CORE },
      { weeks: 9, product: '卫佳捌', kinds: CORE_LEPTO },
      { weeks: 12, product: '卫佳捌', kinds: CORE_LEPTO },
      { weeks: 17, product: '宠必威锐必威', kinds: RABIES },
      { weeks: 26, product: '卫佳伍', kinds: CORE },
      { weeks: 52, product: '宠必威锐必威', kinds: RABIES },
      { weeks: 54, product: '优乐康', kinds: LEPTO },
      { weeks: 104, product: '宠必威锐必威', kinds: RABIES },
      { weeks: 108, product: '优乐康', kinds: LEPTO },
      { weeks: 156, product: '宠必威锐必威', kinds: RABIES },
      { weeks: 160, product: '优乐康', kinds: LEPTO },
      { weeks: 200, product: '卫佳伍', kinds: CORE },
    ],
  },
];

function main() {
  console.log(`参考日：${REF_TODAY}（月龄与日期都按它算）\n`);
  for (const item of CASES) {
    const birthday = birthdayWeeksAgo(item.ageWeeks);
    const records = item.records.map((r) => ({
      id: `${item.no}-${r.weeks}w`,
      vaccineName: r.product,
      vaccinationDate: weeksAfter(birthday, r.weeks),
      kinds: r.kinds,
      productVerified: true,
    }));

    const plan = buildVaccinePlan({
      dogId: `case-${item.no}`,
      birthday,
      records,
      today: new Date(`${REF_TODAY}T00:00:00`),
      reviewed: true,
    });

    console.log('─'.repeat(78));
    console.log(`【案例 ${item.no}】${item.name}（生日 ${birthday}｜${item.ageWeeks} 周龄）`);
    console.log(`  ${item.note}`);
    console.log('  接种记录：');
    if (records.length === 0) console.log('    （空）');
    for (const r of records) console.log(`    · ${r.vaccinationDate} ${r.vaccineName}`);
    console.log('  计划（鱼骨图只显示未完成的）：');
    const pending = plan.steps.filter((s) => s.status !== 'DONE');
    const done = plan.steps.filter((s) => s.status === 'DONE');
    for (const s of pending) {
      console.log(`    ▸ ${s.status.padEnd(9)} ${s.statusLabel}｜${s.label}｜窗口 ${s.windowStart} ~ ${s.windowEnd}`);
    }
    for (const s of done) {
      console.log(`    ✓ ${s.statusLabel}｜${s.label}${s.matchedRecordDate ? `（命中 ${s.matchedRecordDate}）` : ''}`);
    }
    if (plan.conflicts.length > 0) {
      console.log('  冲突/提醒：');
      for (const c of plan.conflicts) console.log(`    ! ${c.reason}`);
    }
    console.log(`  小计：已完成 ${plan.summary.done}｜待办 ${plan.summary.due + plan.summary.overdue + plan.summary.upcoming}｜无记录=${plan.noRecordAtAll ? '是' : '否'}`);
  }
}

// ⚠️ 只有**直接运行这个文件**时才推演（被别的脚本 import 时不要跟着跑 ✗）
if (process.argv[1] && /vaccine-test-cases\.ts$/.test(process.argv[1])) {
  main();
}
