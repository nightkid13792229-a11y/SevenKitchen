import { buildImmunizationSchedule } from '../../../src/domain/health/immunization-schedule';
import {
  VACCINE_COMPONENT_LABELS,
  VACCINE_PRODUCTS,
  coversCoreSeries,
} from '../../../src/domain/health/vaccine-products';

/**
 * 产品表自洽审计（2026-10-06 老板提问后加）。
 *
 * 老板："我们对于核心疫苗的判定是根据什么呢？是根据该产品包含的疫苗种类
 * 是否覆盖犬瘟、细小、腺病毒？还是说只是通过它在产品中的分类来确定的呢？
 * 如果是后者，这种判定依据是否不够严谨呢？"
 *
 * 回答这个问题需要事实。产品表里每支苗有两个字段：
 *   · diseases —— 防哪些病（按说明书/成分抄的）
 *   · kinds    —— 能顶哪几类（分类判定的依据）
 * 这两个字段**各自手写**，所以理论上会飘。这组测试把它们对一遍：
 * 凡是"标了某一类、成分里却没有对应的病"（或者反过来），都要在这里挡下来。
 *
 * 当前 37 支全部自洽（唯一需要解释的是卫佳细，见下面那条单独的用例）。
 */
describe('产品表审计 · kinds 与 diseases 必须自洽（2026-10-06）', () => {
  const rows = VACCINE_PRODUCTS.map((p) => {
    const diseases = (p.diseases || []).join(' ');
    return {
      name: p.name,
      kinds: p.kinds,
      coversDistemper: /犬瘟/.test(diseases),
      coversParvo: /细小/.test(diseases),
      coversLepto: /钩端/.test(diseases),
      coversRabies: /狂犬/.test(diseases),
    };
  });

  it('标了 lepto 的，成分里必须真的含钩端螺旋体（反之亦然）', () => {
    const bad = rows
      .filter((r) => r.kinds.includes('lepto') !== r.coversLepto)
      .map((r) => `${r.name} kinds=${r.kinds.join('+')} 含钩端=${r.coversLepto}`);

    expect(bad).toEqual([]);
  });

  it('标了 rabies 的，成分里必须真的含狂犬（反之亦然）', () => {
    const bad = rows
      .filter((r) => r.kinds.includes('rabies') !== r.coversRabies)
      .map((r) => `${r.name} kinds=${r.kinds.join('+')} 含狂犬=${r.coversRabies}`);

    expect(bad).toEqual([]);
  });

  it('标了 core 的，成分里必须至少覆盖犬瘟或细小之一', () => {
    // 口径说明：核心疫苗 = 覆盖 WSAVA 核心病种（犬瘟热 / 犬细小 / 犬腺病毒 /
    // 犬副流感）**其中至少一种**。不是"必须四种全占" ——
    // 单联苗（卫佳细，只有细小）也是核心病种的疫苗，算 core 是对的；
    // 但**单联/二联苗顶不上核心首免那一整套**，那条限制在
    // recordCoversStep / productCoversSeries 里单独管，与这里的分级无关。
    const bad = rows
      .filter(
        (r) =>
          r.kinds.includes('core') &&
          !r.kinds.includes('core_early') &&
          !(r.coversDistemper || r.coversParvo),
      )
      .map((r) => `${r.name} kinds=${r.kinds.join('+')}`);

    expect(bad).toEqual([]);
  });

  it('没标 core 的，成分里也不该同时覆盖犬瘟和细小', () => {
    const bad = rows
      .filter(
        (r) =>
          !r.kinds.includes('core') &&
          !r.kinds.includes('core_early') &&
          r.coversDistemper &&
          r.coversParvo,
      )
      .map((r) => `${r.name} kinds=${r.kinds.join('+')}`);

    expect(bad).toEqual([]);
  });

  it('卫佳细：细小单联苗，标 core 是有意的（覆盖核心病种之一）', () => {
    const weijiaxi = rows.find((r) => r.name === '卫佳细');

    expect(weijiaxi).toBeTruthy();
    expect(weijiaxi?.coversParvo).toBe(true);
    expect(weijiaxi?.kinds).toContain('core');
  });

  it('产品表规模没被误删（37 支：14 进口可推荐 + 23 国产可选）', () => {
    expect(VACCINE_PRODUCTS.length).toBe(37);
  });
});

/**
 * 顾客看得见的文案里不许出现 Markdown 记号（2026-10-06）。
 *
 * 小程序不认 Markdown —— 依据里写 `**强烈建议**` 会原样显示成星号。
 * 我自己在钩端的依据里就犯过一次，所以加这条守住：
 * basis / label 这些直接渲染给顾客的字符串里不能有 ** 或 __。
 */
describe('顾客可见文案 · 不出现 Markdown 记号（2026-10-06）', () => {
  it('程序表里每一步的 label 与 basis 都不含 ** 或 __', () => {
    const bad: string[] = [];

    for (const item of buildImmunizationSchedule(new Date('2026-02-01'), {
      kinds: ['core', 'core_early', 'rabies', 'lepto'],
    })) {
      if (item.label.includes('**') || item.label.includes('__')) {
        bad.push(`label: ${item.label}`);
      }
      if (item.basis.includes('**') || item.basis.includes('__')) {
        bad.push(`basis: ${item.basis}`);
      }
    }

    expect(bad).toEqual([]);
  });
});

/**
 * 推导出来的分类必须与改之前**手写的**逐一等价（2026-10-06）。
 *
 * 这是这次模型改造的安全绳：`components` 取代了手写的 `kinds`，
 * 万一某支苗的成分登记漏了一种病，分类就会悄悄变 ——
 * 那会直接影响"这一针算不算完成某一步"。所以把改之前的 37 支值抄在这里对账。
 */
describe('分类推导 · 与改造前手写值逐一等价（2026-10-06）', () => {
  /** 改之前手写的 kinds（来自 git 历史里的产品表） */
  const EXPECTED: Record<string, string[]> = {
    卫佳捌: ['core', 'lepto'],
    宠必威优免康: ['core'],
    卫佳伍: ['core'],
    卫佳细: ['core'],
    宠必威幼犬保: ['core_early'],
    优乐康: ['core', 'lepto'],
    宠必威乐必妥: ['lepto'],
    海博莱犬四联加钩端: ['core', 'lepto'],
    维克犬四联加钩端: ['core', 'lepto'],
    宠必威锐必威: ['rabies'],
    瑞贝康: ['rabies'],
    瑞比克: ['rabies'],
    迪安适: ['rabies'],
    维克狂犬: ['rabies'],
    '犬四联（中牧江西）': ['core'],
    科旺福: ['core'],
    宠安士佳: ['core'],
    犬特威: ['core'],
    汪幼保: ['core'],
    金倍安: ['core'],
    汪倍护: ['core', 'rabies'],
  };

  it('🔴 逐支对账：推导值 == 手写值', () => {
    const diffs: string[] = [];

    for (const product of VACCINE_PRODUCTS) {
      const expected = EXPECTED[product.name];
      // 表里没列的都是清一色狂犬苗
      const want = expected ?? ['rabies'];
      const got = product.kinds;
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        diffs.push(`${product.name}: 推导=${JSON.stringify(got)} 手写=${JSON.stringify(want)}`);
      }
    }

    expect(diffs).toEqual([]);
  });

  it('每支苗都登记了成分（不许有空数组）', () => {
    const empty = VACCINE_PRODUCTS.filter((p) => p.components.length === 0).map((p) => p.name);
    expect(empty).toEqual([]);
  });

  it('成分都在词表里（不许出现没定义过的病种）', () => {
    const bad: string[] = [];
    for (const product of VACCINE_PRODUCTS) {
      for (const component of product.components) {
        if (!(component in VACCINE_COMPONENT_LABELS)) {
          bad.push(`${product.name}: ${component}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('只有幼犬保是早期苗（4 周龄抢跑那一支）', () => {
    const early = VACCINE_PRODUCTS.filter((p) => p.earlySeries).map((p) => p.name);
    expect(early).toEqual(['宠必威幼犬保']);
  });

  it('「能不能顶核心首免」按三种核心病判（不再要求副流感）', () => {
    const byName = (n: string) => VACCINE_PRODUCTS.find((p) => p.name === n)!;

    // 犬瘟+腺病毒+细小 三种全覆盖 → 顶得上
    expect(coversCoreSeries(byName('卫佳伍'))).toBe(true);
    expect(coversCoreSeries(byName('犬四联（中牧江西）'))).toBe(true);
    // 只防细小 / 只防两种 → 顶不上
    expect(coversCoreSeries(byName('卫佳细'))).toBe(false);
    expect(coversCoreSeries(byName('犬特威'))).toBe(false);
  });
});
