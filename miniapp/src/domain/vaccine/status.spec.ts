import { describe, expect, it } from 'vitest';
import {
  antibodyEntryTitle,
  formatFullDate,
  ignoreReasonLabel,
  stepKindTone,
  stepLayerLabel,
  stepLayerTone,
  stepRowNote,
  stepStatusLabel,
  stepStatusTone,
  stepTitle,
  stepWhenText,
  stepWindowText,
} from './status';
import type { VaccineStep } from './types';

/**
 * ══ 疫苗板块 · 状态 → 文案（唯一一份）════════════════════════════════════
 *
 * 技术方案《四、前端结构》要求 `status.ts` 是"状态 → 文案与颜色名"的唯一一份；
 * 技术方案 5.3：`domain/vaccine/*` 的纯函数用真单测（输入输出可判定，
 * **不钉措辞以外的实现细节**）。
 *
 * 这组用例逐条对着原型 A–K 十一屏写：**十一屏的状态都能画出来**，
 * 而且画出来就是原型上那句话。
 */

/** 造一个步骤（缺省值 = 一个正常的"待接种"核心针） */
function step(patch: Partial<VaccineStep>): VaccineStep {
  return {
    key: 'core-adult-1',
    kind: 'core',
    kindLabel: '核心疫苗',
    label: '加强（每 3 年）',
    layer: 'MUST',
    windowStart: '2026-10-11',
    windowEnd: '2026-10-25',
    status: 'DUE',
    statusLabel: '',
    titerable: true,
    products: [],
    ...patch,
  };
}

describe('疫苗 · 状态角标（后端算了算，页面只写字）', () => {
  it('四种状态各有自己的话与颜色名', () => {
    expect(stepStatusLabel(step({ status: 'DONE' }))).toBe('已完成');
    expect(stepStatusLabel(step({ status: 'DUE' }))).toBe('待接种');
    expect(stepStatusLabel(step({ status: 'UPCOMING' }))).toBe('还没到时间');
    expect(stepStatusLabel(step({ status: 'OVERDUE' }))).toBe('尽快补种');

    expect(stepStatusTone(step({ status: 'DONE' }))).toBe('done');
    expect(stepStatusTone(step({ status: 'DUE' }))).toBe('due');
    expect(stepStatusTone(step({ status: 'OVERDUE' }))).toBe('over');
    expect(stepStatusTone(step({ status: 'UPCOMING' }))).toBe('plain');
  });

  it('后端给了 statusLabel 就以它为准（例如"已用抗体检测替代"，只有它说得准）', () => {
    expect(stepStatusLabel(step({ status: 'DONE', statusLabel: '已用抗体检测替代' }))).toBe(
      '已用抗体检测替代',
    );
  });

  it('两个层级标识：必打 / 强烈建议（R4：每个待办项都要带）', () => {
    expect(stepLayerLabel('MUST')).toBe('必打');
    expect(stepLayerLabel('SUGGEST')).toBe('强烈建议');
    expect(stepLayerTone('MUST')).toBe('must');
    expect(stepLayerTone('SUGGEST')).toBe('suggest');
  });

  it('类别色条：核心 / 狂犬 / 钩端各一色，认不出的类别走中性色', () => {
    expect(stepKindTone('core')).toBe('core');
    expect(stepKindTone('rabies')).toBe('rabies');
    expect(stepKindTone('lepto')).toBe('lepto');
    expect(stepKindTone('core_early')).toBe('plain');
  });

  it('行标题＝`类别 · 步骤名`', () => {
    expect(stepTitle(step({ kindLabel: '核心疫苗', label: '第 1 针' }))).toBe('核心疫苗 · 第 1 针');
    expect(stepTitle(step({ kindLabel: '狂犬疫苗', label: '年度加强' }))).toBe('狂犬疫苗 · 年度加强');
  });
});

describe('疫苗 · 计划行那一列日期（原型 A/B/C/I/K 都得对）', () => {
  it('A 屏：窗口正开着 → 短日期 + "现在"', () => {
    expect(stepWindowText(step({ status: 'DUE', windowStart: '2026-10-11', windowEnd: '2026-10-25' })))
      .toEqual({ main: '10/11 ~ 10/25', sub: '现在' });
  });

  it('C 屏：还没到 → 全年月日 + `~ 12/20`', () => {
    expect(
      stepWindowText(
        step({ status: 'UPCOMING', windowStart: '2026-11-20', windowEnd: '2026-12-20' }),
      ),
    ).toEqual({ main: '2026/11/20', sub: '~ 12/20' });
  });

  it('B 屏：一针未打、窗口刚挪到今天 → "尽快" + "现在"', () => {
    expect(stepWindowText(step({ status: 'OVERDUE', windowStart: '2026-10-15', windowEnd: '2027-01-30' })))
      .toEqual({ main: '尽快', sub: '现在' });
  });

  it('I 屏：逾期且带原窗口 → "尽快" + "已过"', () => {
    expect(
      stepWindowText(
        step({
          status: 'OVERDUE',
          missedWindowStart: '2025-08-01',
          missedWindowEnd: '2025-08-31',
        }),
      ),
    ).toEqual({ main: '尽快', sub: '已过' });
  });

  it('K 屏：已完成的项写实际接种日 + "已完成"', () => {
    expect(stepWindowText(step({ status: 'DONE', windowStart: '2025-06-02' }))).toEqual({
      main: '2025/06/02',
      sub: '已完成',
    });
  });
});

describe('疫苗 · 下一针那行"什么时候"（原型四句话）', () => {
  it('A 屏：窗口正开着 → 短日期', () => {
    expect(stepWhenText(step({ status: 'DUE', windowStart: '2026-10-11', windowEnd: '2026-10-25' })))
      .toBe('建议接种时间 10/11 ~ 10/25');
  });

  it('C 屏：还没到 → 完整年月日', () => {
    expect(
      stepWhenText(step({ status: 'UPCOMING', windowStart: '2026-11-20', windowEnd: '2026-12-20' })),
    ).toBe('建议接种时间 2026/11/20 ~ 12/20');
  });

  it('B 屏：逾期但没有原窗口 → "建议尽快安排"（不说"补种"，因为没有"原来该打的时间"）', () => {
    expect(stepWhenText(step({ status: 'OVERDUE' }))).toBe('建议尽快安排');
  });

  it('I 屏：逾期且带原窗口 → 写出原建议时间，不用"逾期"两个字', () => {
    expect(
      stepWhenText(
        step({
          status: 'OVERDUE',
          missedWindowStart: '2025-08-01',
          missedWindowEnd: '2025-08-31',
        }),
      ),
    ).toBe('建议尽快补种（原建议时间 2025/08/01 ~ 08/31，已过）');
  });
});

describe('疫苗 · 计划行下面那行小字', () => {
  it('有依据就写依据（C 屏"上一次 2025/11/20"这类是后端给的）', () => {
    expect(stepRowNote(step({ basis: '上一次 2025/11/20' }))).toEqual({
      text: '上一次 2025/11/20',
      overdue: false,
    });
  });

  it('逾期时补一句"原建议时间 X 已过"，并且整行标红（I 屏）', () => {
    expect(
      stepRowNote(
        step({
          status: 'OVERDUE',
          missedWindowStart: '2025-08-01',
          missedWindowEnd: '2025-08-31',
        }),
      ),
    ).toEqual({ text: '原建议时间 2025/08 已过', overdue: true });
  });

  it('已完成且没有依据 → 写"已完成"（K 屏）', () => {
    expect(stepRowNote(step({ status: 'DONE' }))).toEqual({ text: '已完成', overdue: false });
  });

  it('什么都没有就不写（不硬凑一句话）', () => {
    expect(stepRowNote(step({ status: 'UPCOMING' })).text).toBe('');
  });
});

describe('疫苗 · 忽略的原因（两个选项行为一致，只是把"为什么"记下来）', () => {
  it('NOT_NOW / STOPPED 各有一句话，认不出的原因不显示', () => {
    expect(ignoreReasonLabel('NOT_NOW')).toBe('这次先不打');
    expect(ignoreReasonLabel('STOPPED')).toBe('不再接种了');
    expect(ignoreReasonLabel('')).toBe('');
    expect(ignoreReasonLabel(undefined)).toBe('');
  });
});

describe('疫苗 · 抗体检测在记录区那一行（F 屏）', () => {
  it('名字＝`抗体检测 · 项目（结果）`', () => {
    expect(
      antibodyEntryTitle({
        id: 't1',
        testedAt: '2026-10-15',
        targets: ['CORE'],
        result: 'PASS',
      }),
    ).toBe('抗体检测 · 核心三项（合格）');
  });

  it('报告没给结论 → 写"请让兽医判读"（我们不设阈值、不替家长拍板）', () => {
    expect(
      antibodyEntryTitle({
        id: 't2',
        testedAt: '2026-10-15',
        targets: ['CORE', 'RABIES'],
        result: 'UNKNOWN',
      }),
    ).toBe('抗体检测 · 核心三项、狂犬（请让兽医判读）');
  });
});

describe('疫苗 · 日期写法（只切字符串，不按本地时区重算）', () => {
  it('ISO 时间戳也只取日历日 —— 东八区凌晨不会整体差一天', () => {
    expect(formatFullDate('2026-10-11T00:00:00.000Z')).toBe('2026/10/11');
    expect(formatFullDate('2026-10-11')).toBe('2026/10/11');
    expect(formatFullDate('')).toBe('');
  });
});
