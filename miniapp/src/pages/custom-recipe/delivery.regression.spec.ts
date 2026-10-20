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
/**
 * 第 2 页「采购与制作」（2026-10-16 批次 2.6 拆出来的）。
 *
 * 拆页的**理由**：采购量与制作步骤是"采购和做饭那一次"才看的，
 * 而喂食量是天天要看的。混在一页里，天天要看的那个每次都得划过一大段采购清单。
 *
 * ⚠️ 但"不许自己算"这条要求**在两页上都成立**，所以下面有些断言
 * 要同时看两页 —— 拆页不能把守卫拆没了。
 */
const SHOPPING_PAGE = 'src/pages/custom-recipe/delivery-shopping.vue';

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
  const shoppingSource = stripComments(read(SHOPPING_PAGE));

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

  it('★ 喂食量、净用量、营养值都直接来自快照（两页合起来看）', () => {
    // 直接绑到快照字段上，中间不经过任何加工
    expect(source).toContain('content.feeding.dailyIntakeG');
    expect(source).toContain('content.feeding.perMealG');
    /**
     * 2026-10-18：营养数值改由 `RecipeNutritionCard` 渲染，
     * 页面负责**把快照里的 macros 原样传进去**（不再自己挑字段）。
     */
    expect(source).toContain('content.nutrition.macros');
    // 用量与制作那一块搬到了第 2 页
    expect(shoppingSource).toContain('content.shopping.lines');
    // 2026-10-18：采购量整条线删掉 —— 只绑净用量，不再绑 purchaseG
    expect(shoppingSource).toContain('line.netG');
    expect(shoppingSource).toContain('content.shopping.totalNetG');
    expect(shoppingSource).not.toContain('line.purchaseG');
    expect(shoppingSource).not.toContain('totalPurchaseG');
  });

  it('算不出来时如实说"暂时算不出"，而不是显示一堆 0', () => {
    // 0 会让顾客以为"不用买""不用喂"
    /**
     * 2026-10-18：用量表改成共享组件，空态在组件里。
     * 页面仍保留"补剂/食材算不出"的提示能力，但具体文案由组件给。
     */
    const usageTable = read('src/components/recipe/RecipeIngredientUsageTable.vue');
    expect(usageTable).toContain('暂时算不出用量');
    expect(source).toContain('暂时算不出喂食量');
    // 靠"有没有内容"分支，而不是靠数值真假
    expect(shoppingSource).toContain('content.shopping.lines.length');
  });

  it('★ 第 2 页也同样"只渲染不算"（拆页不能把守卫拆没了）', () => {
    /**
     * 采购页比第 1 页更容易违规 —— 这里全是加法：
     * "合计多少克""这批做几天 × 每天多少克"。
     * 所以对它的要求与第 1 页一样严。
     */
    // 2026-10-18：合计从"采购合计"改成"合计净重"
    expect(shoppingSource).toContain('content.shopping.totalNetG');
    expect(shoppingSource).not.toContain('content.shopping.totalPurchaseG');

    /**
     * ⚠️ **第一版这条守卫写窄了。**
     *
     * 我原来只盯"两个字段相减"（`purchaseG - netG`），
     * 然后故意注入 `lines.reduce((a, l) => a + l.purchaseG, 0)` 验证 ——
     * **守卫没红**。而对数组求和恰恰是这一页最容易犯的错
     * （后端已经给了 `totalPurchaseG`，再自己加一遍就是第二套口径）。
     *
     * 现在覆盖三种真实形态，同时**放过字符串拼接**
     * （`item.perKgG + ' g'` 是显示，不是计算）。
     */
    const SNAPSHOT_NUMBERS = [
      'purchaseG',
      'totalPurchaseG',
      'totalNetG',
      'netG',
      'dailyIntakeG',
      'perMealG',
      'cycleDays',
    ].join('|');

    /**
     * ① 对明细求和（reduce / map+sum）
     *
     * ⚠️ **第二版这里又写窄了一次**：原来用 `reduce\\([^)]*` ，
     * 而真实写法是 `reduce((a, l) => a + l.purchaseG, 0)` ——
     * `[^)]*` 在参数列表的 `(a, l` 之后的第一个 `)` 就断了，够不到字段名。
     * 注入验证时守卫仍然没红，才发现。
     *
     * 改成限定长度的通配（`[\s\S]{0,200}?`），能跨过括号。
     */
    expect(shoppingSource).not.toMatch(
      new RegExp(`reduce\\([\\s\\S]{0,200}?\\b(?:${SNAPSHOT_NUMBERS})\\b`),
    );

    // ② 两个快照字段互相运算
    expect(shoppingSource).not.toMatch(
      new RegExp(
        `\\b(?:${SNAPSHOT_NUMBERS})\\b\\s*[-+*/]\\s*(?:[A-Za-z_$][\\w$]*\\.)?(?:${SNAPSHOT_NUMBERS})\\b`,
      ),
    );

    // ③ 用 Number() 把快照字段再包一层（lossRate 除外 —— 那是展示换算）
    expect(shoppingSource).not.toMatch(
      new RegExp(
        `Number\\(\\s*(?:[A-Za-z_$][\\w$]*\\.)?(?:purchaseG|netG|totalNetG|totalPurchaseG|dailyIntakeG|perMealG|cycleDays)\\b`,
      ),
    );

    // ④ 字符串拼接要放过：perKgG + ' g' 是显示
    /**
     * 2026-10-18：补剂改成「这次要备多少」（后端算好的 `totalG`）。
     * 消费者只需要格式化，**不许自己乘总净重**。
     */
    expect(shoppingSource).toContain('formatSupplementTotal');
    // 读的是后端算好的 totalG（模板里通过 formatSupplementTotal 间接取）
    expect(shoppingSource).toContain('totalG');
    expect(shoppingSource).not.toContain("perKgG + ' g'");
  });

  it('★ 两页之间能互相跳转（拆了页不等于要顾客自己找路）', () => {
    /**
     * 2026-10-21 多份交付：跳转路径统一由 `utils/custom-recipe-delivery.ts`
     * 拼接（要带 recipeId），页面里只剩 helper 调用 —— 所以路径断言
     * 从两页源码移到 helper 源码，意图不变。
     */
    const helperSource = stripComments(
      read('src/utils/custom-recipe-delivery.ts'),
    );
    expect(source).toContain('buildDeliveryShoppingUrl');
    expect(shoppingSource).toContain('buildDeliveryDetailUrl');
    expect(helperSource).toContain('/pages/custom-recipe/delivery-shopping');
    expect(helperSource).toContain('/pages/custom-recipe/delivery');
    /**
     * 回第 1 页用 `redirectTo` 而不是 `navigateTo` ——
     * 后者会叠成"列表 → 食谱 → 采购 → 食谱"三层，
     * 顾客连按返回要按好几次才回得到订单。
     */
    expect(shoppingSource).toContain('redirectTo');
  });

  it('补充剂与食材分开渲染（顾客采购时是两件事）', () => {
    expect(source).toContain('isSupplement');
    /**
     * 2026-10-18：补剂那一块改成"额外补充的营养素"（列营养素名不是产品名），
     * 来源是 `content.supplements[].targets`。
     * 与食材依然**分成两块**渲染 —— 食材走 `foodItems`，营养素走 `nutrientRows`。
     */
    expect(source).toContain('content.value.supplements')
    expect(source).toContain('nutrientRows')
    expect(source).toContain('foodItems');
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

  it('★ 第 2 页在 pages.json 里注册过（漏了会白屏）', () => {
    const pagesJson = read('src/pages.json');
    expect(pagesJson).toContain('pages/custom-recipe/delivery-shopping');
    /**
     * 而且必须在**主包的 pages 数组**里 —— 我第一次插入时插到了
     * `subPackages` 里，JSON 依然合法、构建也不报错，但页面根本不存在。
     */
    const parsed = JSON.parse(pagesJson) as {
      pages: Array<{ path: string }>;
    };
    expect(parsed.pages.map((p) => p.path)).toContain(
      'pages/custom-recipe/delivery-shopping',
    );
  });

/**
 * 交付物 · 长图导出（2026-10-16，批次 2.7）
 *
 * ## 为什么单独盯这两个文件
 *
 * 长图是「采购与制作」那张单子的**打印版**，它必须和屏幕上看到的**一模一样** ——
 * 一旦绘制代码里自己算一遍（比如把各行采购量加起来），
 * 就会出现"手机上写 1660g、长图上写别的数"这种事，
 * 而顾客是照着图去买菜的。
 */
describe('交付物 · 长图导出', () => {
  const printSource = stripComments(read('src/utils/delivery-print.ts'));
  // 变量在这里重新取一次：上面那个 describe 里的同名变量作用域不跨块
  const shoppingSource = stripComments(read(SHOPPING_PAGE));

  it('★ 绘制文件里没有任何计算（与页面同一条红线）', () => {
    // 采购量、合计、损耗全部来自快照，这里只许做字符串拼接
    expect(printSource).not.toMatch(/\.reduce\(/);
    expect(printSource).not.toMatch(/Number\(/);
    expect(printSource).not.toMatch(/parseFloat|parseInt/);
    // 也不许出现算术运算（模板里的 `${x} g` 是拼接，不含运算符）
    expect(printSource).not.toMatch(
      /\b(?:purchaseG|netG|totalNetG|totalPurchaseG|dailyIntakeG|perMealG|perKgG|cycleDays)\b\s*[-+*/]/,
    );
  });

  it('★ 复用 DIY 那套画布，不另写排版', () => {
    expect(printSource).toContain('PrintCanvasBuilder');
    for (const method of [
      'drawBrandHeader',
      'drawFactCards',
      'drawTable',
      'drawSectionTitle',
      'drawProductionSteps',
    ]) {
      // drawFooter 由页面调用（页脚日期是页面的信息），不在绘制文件里
    }
    for (const method of [
      'drawBrandHeader',
      'drawFactCards',
      'drawTable',
      'drawSectionTitle',
      'drawProductionSteps',
    ]) {
      expect(printSource).toContain(method);
    }
  });

  it('★ 补充剂要说明它不在食材里（否则顾客会算重）', () => {
    // 2026-10-18：采购量删掉后，"不计入采购总量"失去指代对象，
    // 改成直接说明"不在上面的食材里，需要单独准备"。
    expect(printSource).toContain('补充剂不在上面的食材里');
  });

  it('★ 长图高度按内容撑开，不用固定 A4（否则最下面会被裁掉）', () => {
    expect(shoppingSource).toContain('getCurrentY()');
    expect(shoppingSource).toContain('CANVAS_FOOTER_SPACE');
    // 内容超出要重画一遍
    expect(shoppingSource).toContain('needed > CANVAS_LOGICAL_HEIGHT');
  });

  it('★ 画布放在屏幕外，不能用 display:none（那样画出来是空白）', () => {
    expect(shoppingSource).toContain('position: fixed');
    expect(shoppingSource).toContain('left: -9999px');
    expect(shoppingSource).not.toMatch(/\.print-canvas\s*\{[^}]*display:\s*none/);
  });
});
