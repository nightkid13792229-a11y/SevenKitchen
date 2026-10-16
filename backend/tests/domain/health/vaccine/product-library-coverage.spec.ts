import {
  CORE_COMPONENTS,
  VACCINE_COMPONENTS,
  VACCINE_PRODUCTS,
  checkBrandConsistency,
  classifyVaccineKinds,
  findProductByText,
  recommendProductsForStep,
} from '../../../../src/domain/health/vaccine/products';

/**
 * 产品库覆盖 · B1（2026-10-16）
 *
 * ── 这组测试钉的是什么 ───────────────────────────────────────
 *
 * 上线前跑分（`.eval-data/vaccine-books`，23 张真疫苗本 / 100 来行）里，
 * 有 **9 个写法**落不到产品库上。这 9 个分三类，处置完全不同，
 * 所以**每一个都要有用例**（不是"补了就完事"）：
 *
 *   ① **该补进库**：是真实商品名 / 法定通用名，只是我们没收录
 *      → 宠派纯、西诺生物（CTN-1株）、国产犬四联的通用名
 *   ② **不做**（猫苗）：本模块只做犬
 *      → 妙三多、猫三联、猫泛白细胞减少症…三联灭活疫苗
 *      ⚠️ "不进库"**还不够**：它还得**不归类** —— 改之前
 *         「猫三联」会被 /[二三]联/ 判成**犬早期核心疫苗** ✗（下面有用例）
 *   ③ **不该进库**（通用词 / 根本不是产品名）
 *      → 狂犬、狂犬疫苗 → 没有产品，但要**能归到狂犬类**（计划要用）
 *      → 年度加强、测抗体 → 既不认产品，也**不许归任何类**（绝不能被当成核心苗）
 *
 * 第二组用例管**新增条目的质量**：每条都能被认出、归类正确、
 * 且**不许抢走已有产品的匹配**（反向用例 —— 补库最容易犯的错就是这个）。
 */

/** 一条用例：文本 → 认成哪支（null = 认不出）+ 归到哪几类 */
function judge(text: string) {
  return {
    product: findProductByText(text)?.name ?? null,
    kinds: classifyVaccineKinds(text),
  };
}

describe('B1 ① 该补进库 · 跑分里那 3 个真产品名（2026-10-16）', () => {
  it('「宠派纯® 狂犬病灭活疫苗（PV/BHK-21株）」→ 爱宠犬狂犬（狂犬）', () => {
    // 2026-10-16 跑分实测就是这么读出来的（01-赛文 那张本子）
    expect(judge('宠派纯® 狂犬病灭活疫苗（PV/BHK-21株）')).toEqual({
      product: '爱宠犬狂犬',
      kinds: ['rabies'],
    });
  });

  it('半角括号 + 空格的写法也认得出（模型两种都读过）', () => {
    expect(judge('宠派纯® 狂犬病灭活疫苗 (PV/BHK-21株)')).toEqual({
      product: '爱宠犬狂犬',
      kinds: ['rabies'],
    });
  });

  it('「西诺生物 狂犬病冻干灭活疫苗（CTN-1株）」→ 诺维瑞（狂犬）', () => {
    expect(judge('西诺生物 狂犬病冻干灭活疫苗（CTN-1株）')).toEqual({
      product: '诺维瑞',
      kinds: ['rabies'],
    });
  });

  it('模型漏读「冻干」两个字时也认得出（两次跑分各读出一版）', () => {
    for (const text of [
      '狂犬病冻干灭活疫苗（CTN-1株）',
      '狂犬病灭活疫苗（CTN-1株）',
      '西诺生物 狂犬病灭活疫苗（CTN-1株）',
    ]) {
      expect(judge(text)).toEqual({ product: '诺维瑞', kinds: ['rabies'] });
    }
  });

  it('「犬瘟热、犬副流感、犬腺病毒与犬细小病毒病四联活疫苗」→ 中立条目「犬四联活疫苗」（核心）', () => {
    const result = judge('犬瘟热、犬副流感、犬腺病毒与犬细小病毒病四联活疫苗');

    expect(result.product).toBe('犬四联活疫苗');
    // ⚠️ `other` 是字面兜底带出来的（名字里有"副流感"）—— 它**不影响计划**，
    //    断言里写清楚，免得以后有人以为这里出错了：
    //    这一针该算的仍然是"核心疫苗" ✓
    expect(result.kinds).toContain('core');
    expect(result.kinds).not.toContain('core_early');
  });

  it('这个通用名带来的病种就是犬四联那四个（不是猜的）', () => {
    const product = VACCINE_PRODUCTS.find((item) => item.name === '犬四联活疫苗');

    expect(product?.components).toEqual(['cdv', 'cav', 'cpi', 'cpv']);
    // 核心三件全覆盖 → 才算得上"核心苗"
    for (const component of CORE_COMPONENTS) {
      expect(product?.components).toContain(component);
    }
  });
});

describe('B1 ② 不做（猫苗）：既不进库，也不许冒充犬的类别', () => {
  /** 跑分里真出现过的猫苗写法（10.jpg / 02.jpg / 17.jpg / 21.jpg / 22.jpg） */
  const CAT_WRITINGS = [
    '妙三多',
    '猫三联',
    '猫泛白细胞减少症、杯状病毒病、鼻气管炎三联灭活疫苗（708株+60株+64株）',
    '猫鼻气管炎、杯状病毒病、泛白细胞减少症三联灭活疫苗（708株+60株+64株）',
  ];

  it.each(CAT_WRITINGS)('「%s」→ 认不出产品，而且**不归任何类**', (text) => {
    expect(judge(text)).toEqual({ product: null, kinds: [] });
  });

  it('🔴 改之前「猫三联」会被判成**犬早期核心疫苗** —— 这条用例就是防它回来', () => {
    // 成因：字面兜底里的 /[二三]联/ 命中了"三联"。core_early 会影响计划
    // （4 周龄那一针"算完成"），记到狗身上就是"系统以为打过犬二联了" ✗
    expect(classifyVaccineKinds('猫三联')).not.toContain('core_early');
    expect(classifyVaccineKinds('猫三联')).toEqual([]);
  });

  it('库里一支猫苗都没有（名字/别名里不出现猫专有说法）', () => {
    const catLike = VACCINE_PRODUCTS.filter((product) =>
      /猫|妙三多|feline|杯状|泛白细胞减少/i.test(
        [product.name, ...(product.aliases || [])].join(' '),
      ),
    ).map((product) => product.name);

    expect(catLike).toEqual([]);
  });

  it('⚠️ 但「犬、猫」共用的狂犬苗照旧判成狂犬 —— 物种这一关不能见"猫"就拦', () => {
    // 宠必威锐必威 / 瑞比克 / 迪安适 的说明书适用动物都写"犬、猫"，
    // 本子上写「犬、猫狂犬病灭活疫苗」是**犬**的记录 ✓
    expect(classifyVaccineKinds('犬、猫狂犬病灭活疫苗')).toEqual(['rabies']);
    expect(classifyVaccineKinds('猫用狂犬病灭活疫苗')).toEqual(['rabies']);
  });
});

describe('B1 ③ 不该进库（通用词）· 归类必须合理', () => {
  it('「狂犬」/「狂犬疫苗」：没有这个产品，但要能归到**狂犬类**（计划要用）', () => {
    for (const text of ['狂犬', '狂犬疫苗', '狂犬病疫苗']) {
      expect(judge(text)).toEqual({ product: null, kinds: ['rabies'] });
    }
  });

  it('🔴「年度加强」「测抗体」既不是产品、也**不许归任何类**', () => {
    // 这两行是"本子上的备注"跑到了产品名那一列（11.jpg）。
    // 最怕的不是认不出，而是被哪个字面规则**误吸**进核心苗那一类 ✗ ——
    // 那就等于"系统以为这一针打完了"，从此不再提醒 ✗✗
    for (const text of ['年度加强', '测抗体', '抗体检测', '加强免疫']) {
      expect(judge(text)).toEqual({ product: null, kinds: [] });
    }
  });
});

describe('B1 补的这批苗 · 每条都要认得出、归类正确（2026-10-16）', () => {
  /**
   * 新增的**别名**（都是法定通用名 / 毒株，逐字有据 —— 依据写在 products.ts 的注释里）。
   * `kinds` 写全，顺序不敏感（下面用 toEqual 比较**排序后**的结果）。
   */
  const ALIAS_CASES: Array<{ text: string; product: string; kinds: string[] }> = [
    // 法定通用名（硕腾官网 PDF / 默沙东官网产品页 / 项目文档 2.6 表，两处互证）
    {
      text: '犬瘟热、腺病毒2型、副流感、细小病毒病四联活疫苗',
      product: '卫佳伍',
      kinds: ['core'],
    },
    {
      text: '犬瘟热、传染性肝炎、细小病毒病、副流感四联活疫苗',
      product: '宠必威优免康',
      kinds: ['core'],
    },
    {
      text: '犬瘟热、腺病毒病、细小病毒病、副流感四联活疫苗',
      product: '海博莱犬四联加钩端',
      kinds: ['core', 'lepto'],
    },
    {
      text: '犬钩端螺旋体病（犬型、黄疸出血型）二价灭活疫苗',
      product: '宠必威乐必妥',
      kinds: ['lepto'],
    },
    // 毒株写法（本子上常常只印毒株，不印商品名）
    { text: '狂犬病灭活疫苗（G52株）', product: '瑞贝康', kinds: ['rabies'] },
    { text: '狂犬病灭活疫苗（HCP-SAD株）', product: '瑞比克', kinds: ['rabies'] },
    {
      text: '狂犬病灭活疫苗（Pasteur RIV株）',
      product: '宠必威锐必威',
      kinds: ['rabies'],
    },
    { text: '狂犬病灭活疫苗（SVR-289株）', product: '迪安适', kinds: ['rabies'] },
    { text: '狂犬病灭活疫苗（VP12株）', product: '维克狂犬', kinds: ['rabies'] },
    // 中立条目（国标毒株，多家共用）
    {
      text: '狂犬病灭活疫苗（Flury LEP株）',
      product: '狂犬病灭活疫苗（Flury LEP株）',
      kinds: ['rabies'],
    },
  ];

  it.each(ALIAS_CASES)('「$text」→ $product', ({ text, product, kinds }) => {
    const result = judge(text);

    expect(result.product).toBe(product);
    // `other` 是字面兜底（副流感/冠状这类"我们没有程序"的病）带出来的，不影响计划，
    // 所以这里只要求**该有的类都在**，不要求一模一样
    for (const kind of kinds) {
      expect(result.kinds).toContain(kind);
    }
  });

  it('认出来的产品名，都能在库里查到（不许出现"半截名字"）', () => {
    for (const item of ALIAS_CASES) {
      const hit = findProductByText(item.text);
      expect(VACCINE_PRODUCTS.map((product) => product.name)).toContain(hit?.name);
    }
  });

  it('中立条目：品牌为空、不参与推荐（"推荐只给进口"那条口径）', () => {
    for (const name of ['犬四联活疫苗', '狂犬病灭活疫苗（Flury LEP株）']) {
      const product = VACCINE_PRODUCTS.find((item) => item.name === name);

      expect(product).toBeDefined();
      expect(product?.brand).toBe('');
      expect(product?.recommendable).toBe(false);
    }
  });

  it('中立条目不会出现在"常见的有…"推荐里（recommendable=false 的过滤）', () => {
    const coreNames = recommendProductsForStep('core', 10).map((p) => p.name);
    const rabiesNames = recommendProductsForStep('rabies', 16).map((p) => p.name);

    expect(coreNames).not.toContain('犬四联活疫苗');
    expect(rabiesNames).not.toContain('狂犬病灭活疫苗（Flury LEP株）');
  });

  it('中立条目不会误报品牌冲突（写法里带厂家名时）', () => {
    // 中牧的展商页上挂的就是这个通用名 —— 本子上带"中牧"两字很正常，
    // 而中立条目的 manufacturer 里本来就列了中牧/科前/五星，不该报冲突 ✗
    const result = checkBrandConsistency(
      '中牧 犬瘟热、犬副流感、犬腺病毒与犬细小病毒病四联活疫苗',
      '犬四联活疫苗',
    );

    expect(result.conflict).toBe(false);
  });

  it('新增条目的病种值都在闭集里（脏值会带偏分类）', () => {
    for (const product of VACCINE_PRODUCTS) {
      for (const component of product.components) {
        expect(VACCINE_COMPONENTS).toContain(component);
      }
    }
  });
});

describe('B1 补库最容易犯的错 · 不许抢走已有产品的匹配（反向用例）', () => {
  it('「卫佳捌」不会被新的四联通用名吸到卫佳伍上', () => {
    expect(findProductByText('卫佳捌 Vanguard Plus 5/CV-L')?.name).toBe('卫佳捌');
    expect(findProductByText('卫佳®捌 Vanguard® Plus 5/CV-L')?.name).toBe('卫佳捌');
  });

  it('写了厂家的国产犬四联，落回**具体厂家**那条，不是中立条目', () => {
    expect(findProductByText('中牧犬四联')?.name).toBe('犬四联（中牧江西）');
    expect(findProductByText('中牧犬四联活疫苗')?.name).toBe('犬四联（中牧江西）');
    expect(findProductByText('科前犬四联')?.name).toBe('科旺福');
    expect(findProductByText('五星犬四联')?.name).toBe('宠安士佳');
    // 只有光秃秃一个通用名、分不出厂家时，才落中立条目 ✓
    expect(findProductByText('犬四联活疫苗')?.name).toBe('犬四联活疫苗');
  });

  it('两支狂犬苗不会被毒株别名互相吸走', () => {
    expect(findProductByText('狂犬病灭活疫苗（G52株）')?.name).toBe('瑞贝康');
    expect(findProductByText('狂犬病灭活疫苗（HCP-SAD株）')?.name).toBe('瑞比克');
    expect(findProductByText('瑞贝康')?.name).toBe('瑞贝康');
    expect(findProductByText('瑞比克® Rabvac™ 3')?.name).toBe('瑞比克');
  });

  it('国产狂犬的毒株（Flury LEP）归中立条目，不会被记成齐鲁或吉林正业', () => {
    // 两家都用这个国标株（齐鲁 150257517 / 吉林正业 070227517）——
    // 硬挂一家 = 把别家的苗记成这家的 ✗
    expect(findProductByText('狂犬病灭活疫苗（Flury LEP株）')?.name).toBe(
      '狂犬病灭活疫苗（Flury LEP株）',
    );
    // 本子上写了厂家/商品名时，照旧走具体那条 ✓
    expect(findProductByText('齐鲁犬狂犬')?.name).toBe('齐鲁犬狂犬');
    expect(findProductByText('贝乐美')?.name).toBe('贝乐美');
  });

  it('宠必威家的两支苗不会互相吸（优免康 ≠ 幼犬保）', () => {
    expect(judge('宠必威® 幼犬保')).toEqual({
      product: '宠必威幼犬保',
      kinds: ['core_early'],
    });
    expect(findProductByText('宠必威®优免康')?.name).toBe('宠必威优免康');
    expect(findProductByText('宠必威®锐必威')?.name).toBe('宠必威锐必威');
    expect(findProductByText('宠必威®乐必妥')?.name).toBe('宠必威乐必妥');
  });

  it('真本子上的那几种写法整体回归一遍（跑分里的高频行）', () => {
    const EXPECTED: Array<[string, string]> = [
      ['卫佳®伍', '卫佳伍'],
      ['卫佳伍 Vanguard Plus 5', '卫佳伍'],
      ['卫佳® 伍', '卫佳伍'],
      ['卫佳伍', '卫佳伍'],
      ['宠必威®优免康', '宠必威优免康'],
      ['宠必威® 幼犬保', '宠必威幼犬保'],
      ['狂犬病灭活疫苗(G52株) 瑞贝康', '瑞贝康'],
      ['狂犬病灭活疫苗（G52株）RABISIN 瑞贝康', '瑞贝康'],
      ['瑞比克', '瑞比克'],
      ['英特威®锐必威', '宠必威锐必威'],
    ];

    for (const [text, name] of EXPECTED) {
      expect([text, findProductByText(text)?.name]).toEqual([text, name]);
    }
  });
});
