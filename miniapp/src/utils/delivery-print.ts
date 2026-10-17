import type { DeliveryContentSnapshot } from '@/api/custom-recipe';
import type { PrintCanvasBuilder } from './print-canvas';

/**
 * 交付物 · 「采购与制作」长图（2026-10-16，批次 2.7）
 *
 * ## 为什么单独一个文件
 *
 * 绘制逻辑与页面分开，有两个实在的好处：
 *   · 「页面里一个数都不算」这条要求，守卫可以直接盯这个文件
 *     （它只做 `String(x)` 与拼接，不做任何加减乘除）
 *   · 将来小程序之外（比如后台也出一张）能直接复用
 *
 * ## 复用的是 DIY 制作单那套画布
 *
 * `PrintCanvasBuilder` 已经把「照着做」这件事做对了：
 * 表格会换行、小字说明、步骤编号、页脚。这里只负责**把快照喂给它** ——
 * 不去重写一套排版，否则同一张单子会长得不一样。
 *
 * ## ⚠️ 这里**没有任何计算**
 *
 * 要买多少克、合计多少、损耗多少，全部来自交付时冻结的快照。
 * 这个文件里只允许出现 `String()`、模板拼接与「有没有值」的判断。
 * 一旦在这里写 `reduce` 或 `Number()`，就又是"同一份数据算两遍"。
 */

/** 长图用的输入（页面从交付接口取到后传进来） */
export interface DeliverySheetInput {
  content: DeliveryContentSnapshot;
  /** 第几版（交付版本号） */
  version: number | null | undefined;
  /** 交付日期，已格式化好的字符串 */
  deliveredAtText: string;
  /** 狗狗名字（拿不到就留空，不编） */
  dogName?: string | null;
  /** 损耗系数 → 百分比文案由页面给（那是展示换算，不在这个文件里做） */
}

/** 文案：有值就显示，没有就显示占位符 —— 不显示 0，0 会让人以为"不用买" */
function text(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

export function drawDeliverySheet(
  builder: PrintCanvasBuilder,
  input: DeliverySheetInput,
): void {
  const { content } = input;

  // ---- 头部 ----
  builder.drawBrandHeader({
    brand: '赛文的食堂',
    logoPath: '/static/logo.png',
    title: content.recipe.name || '专属食谱',
    subtitle: [
      input.dogName ? `${input.dogName} 的专属食谱` : '专属食谱',
      input.version ? `第 ${input.version} 版` : '',
      input.deliveredAtText,
    ]
      .filter(Boolean)
      .join(' · '),
  });

  // ---- 这一批要做多少 ----
  const feedingFacts = [
    { label: '每天', value: text(content.feeding.dailyIntakeG, '—') },
    { label: '餐数', value: text(content.feeding.mealsPerDay, '—') },
    { label: '每餐', value: text(content.feeding.perMealG, '—') },
    { label: '做几天', value: text(content.feeding.cycleDays, '—') },
    {
      label: '总净重',
      value: content.shopping.totalNetG ? `${content.shopping.totalNetG}` : '—',
    },
  ].filter((item) => item.value !== '—');

  if (feedingFacts.length > 0) {
    builder.drawFactCards('这一批要做多少', feedingFacts, { columns: 5 });
  }

  // ---- 食材净用量 ----
  //
  // 2026-10-18：**采购量整条线删掉**（老板定）。
  // 只给"这次要用多少"，买多少让顾客自己判断 ——
  // 损耗率是经验估算，不同食材差很多，乘进去当"建议采购量"等于用估算冒充精算。
  if (content.shopping.lines.length > 0) {
    builder.drawSectionTitle('每种食材要用多少（净用量）');
    builder.drawTable(
      ['原料名称', '净用量'],
      content.shopping.lines.map((line) => [
        line.name,
        `${text(line.netG, '—')} g`,
      ]),
      {
        colWidths: [700, 320],
        wrapColumns: [true, false],
        totalRow: ['合计净重', `${text(content.shopping.totalNetG, '—')} g`],
      },
    );
    builder.drawNote('只写这次要用多少。要买多少，你自己判断。');
  } else {
    builder.drawSectionTitle('每种食材要用多少')
    builder.drawNote('暂时算不出用量，请联系客服')
  }

  // ---- 营养补充剂（按每 kg 食材给，顾客好按自己做的量换算）----
  if (content.supplements.length > 0) {
    builder.drawSectionTitle('营养补充剂（每 kg 食材加多少）');
    builder.drawTable(
      ['补充剂', '每 kg 食材添加', '什么时候加'],
      content.supplements.map((item) => [
        item.name,
        item.perKgG === null || item.perKgG === undefined
          ? '按说明加'
          : `${item.perKgG} g`,
        item.timing || '—',
      ]),
      {
        colWidths: [320, 300, 400],
        wrapColumns: [true, false, true],
      },
    );
    /**
     * 补充剂**不进食材配比** —— 它不是"食材重量"，按克算总重没意义。
     * 2026-10-18：采购量删掉后，"不计入采购总量"这句话失去指代对象，
     * 改成直接说明"要单独准备"。
     */
    builder.drawSupplementNotice('补充剂不在上面的食材里，需要单独准备。');
  }

  // ---- 怎么做 ----
  if (content.steps.length > 0) {
    builder.drawSectionTitle('怎么做');
    builder.drawProductionSteps(content.steps.join('\n'));
  }

  // ---- 怎么存 ----
  if (content.storage) {
    builder.drawSectionTitle('怎么存');
    builder.drawNote(content.storage);
  }
}
