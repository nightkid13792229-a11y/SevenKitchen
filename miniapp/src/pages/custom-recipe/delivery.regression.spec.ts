import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 交付内容页 · 守卫（2026-10-16，批次 2.4）
 *
 * ## 这条守卫守的是老板那句要求
 *
 * 「**所有的计算交给后端，前端只负责渲染**」
 *
 * 交付页是最容易违反它的一页 —— 因为这里全是数字：
 * 每天喂多少克、要买多少、损耗多少、每餐多少。
 * 顺手在这里补一个 `Math.round` 太自然了，而一旦补了，
 * 就又变成"同一份数据三个端各算一遍"。
 *
 * 所以这里断言：**页面里不许出现业务数值的计算**。
 * 唯一允许的是"损耗系数 1.07 → 7%"这种**纯展示换算**。
 */

const PAGE = 'src/pages/custom-recipe/delivery.vue';

function read(relativePath: string): string {
  return readFileSync(
    resolve(process.cwd(), relativePath),
    'utf-8',
  );
}

/** 去掉注释，免得自己写的注释把自己骗了（本项目踩过 4 次） */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/<!--[\s\S]*?-->/g, '');
}

describe('交付内容页 · 只渲染不计算', () => {
  const source = stripComments(read(PAGE));

  it('★ 页面里没有把业务数值再算一遍', () => {
    /**
     * 逐个揪出**算术**表达式。
     *
     * ## 四个坑，每一个都是"守卫明明该红却没红"逼出来的
     *
     * ① **两个方向都要查**。只查"字段在运算符左边"（`purchaseG + x`）会漏掉
     *    `a + l.purchaseG`。我故意加了一处计算验证，第一版守卫没红。
     * ② **要允许成员访问前缀**。真实写法是 `l.purchaseG`、`line.netG`。
     * ③ **排除与引号拼接**：`ratioPercent + '%'` 是加单位，不是计算。
     * ④ ★ **排除必须写成 `(?!\s*['"\`])` 而不是 `\s*(?!['"\`])`** ——
     *    后者会因为正则**回溯**失效（`\s*` 可以只匹配 0 个字符，
     *    于是断言看到的是空格而不是引号）。这一条最难发现：
     *    我按直觉写的就是错的那种，靠一段单独的正则用例才发现。
     *
     * 教训：**守卫本身也要被验证**，而且要用"应该命中/不应该命中"两组样例去验，
     * 只验一边等于没验。
     */
    const FIELDS =
      'dailyIntakeG|perMealG|mealsPerDay|purchaseG|netG|totalPurchaseG|totalNetG|ratioPercent|energyDensityKcalPerKg';
    const MEMBER = '[A-Za-z_$][\\w$]*\\.';
    // 字段在运算符左边：`item.purchaseG * 2`
    const LEFT = new RegExp(
      `(?:${MEMBER})?\\b(?:${FIELDS})\\b\\s*[*/+\\-](?!\\s*['"\`])`,
      'g',
    );
    // 字段在运算符右边：`a + l.purchaseG`
    const RIGHT = new RegExp(
      `[*/+\\-]\\s*(?:${MEMBER})?\\b(?:${FIELDS})\\b`,
      'g',
    );

    const offenders = [
      ...[...source.matchAll(LEFT)].map((m) => m[0].trim()),
      ...[...source.matchAll(RIGHT)].map((m) => m[0].trim()),
    ];

    expect(offenders).toEqual([]);
  });

  it('★ 守卫自己也要被验证：应该命中的要命中、不该命中的别误报', () => {
    // 同一个正则，用两组样例验 —— 只验一边等于没验
    const FIELDS =
      'dailyIntakeG|perMealG|mealsPerDay|purchaseG|netG|totalPurchaseG|totalNetG|ratioPercent|energyDensityKcalPerKg';
    const MEMBER = '[A-Za-z_$][\\w$]*\\.';
    const LEFT = new RegExp(
      `(?:${MEMBER})?\\b(?:${FIELDS})\\b\\s*[*/+\\-](?!\\s*['"\`])`,
      'g',
    );
    const RIGHT = new RegExp(
      `[*/+\\-]\\s*(?:${MEMBER})?\\b(?:${FIELDS})\\b`,
      'g',
    );
    const hits = (text: string) =>
      [...text.matchAll(LEFT)].length + [...text.matchAll(RIGHT)].length > 0;

    // 应该命中：真的在算
    expect(hits('lines.reduce((a, l) => a + l.purchaseG, 0)')).toBe(true);
    expect(hits('item.ratioPercent * 2')).toBe(true);
    expect(hits('content.feeding.dailyIntakeG / 1000')).toBe(true);

    // 不该命中：只是显示或拼单位
    expect(hits("item.ratioPercent + '%'")).toBe(false);
    expect(hits('{{ line.purchaseG }} 克')).toBe(false);
    expect(hits('content.shopping.totalPurchaseG')).toBe(false);
  });

  it('★ 喂食量、采购量、营养值都直接来自快照', () => {
    // 直接绑到快照字段上，中间不经过任何加工
    expect(source).toContain('content.feeding.dailyIntakeG');
    expect(source).toContain('content.feeding.perMealG');
    expect(source).toContain('content.shopping.lines');
    expect(source).toContain('line.purchaseG');
    expect(source).toContain('content.nutrition.energyDensityKcalPerKg');
  });

  it('算不出来时如实说"暂时算不出"，而不是显示一堆 0', () => {
    // 0 会让顾客以为"不用买""不用喂"
    expect(source).toContain('暂时算不出要买多少');
    expect(source).toContain('暂时算不出喂食量');
    // 靠"有没有内容"分支，而不是靠数值真假
    expect(source).toContain('content.shopping.lines.length');
  });

  it('补充剂与食材分开渲染（顾客采购时是两件事）', () => {
    expect(source).toContain('isSupplement');
    expect(source).toContain('supplementItems');
  });

  it('★ 明确告诉顾客"这一版是冻结的，之后改配方不影响"', () => {
    // 交付 = 一次冻结，是这次重构最核心的保证，必须在界面上说出来
    expect(source).toContain('之后调整配方不会改变你现在看到的版本');
  });

  it('幂等靠后端，页面不自己挡重复点击的提示', () => {
    const page = read('src/pages/custom-recipe/order-detail.vue');
    expect(page).toContain('confirmReceiptRequest');
    // 后端回 alreadyConfirmed 时提示"你已经确认过了"，而不是报错
    expect(page).toContain('你已经确认过了');
  });
});
