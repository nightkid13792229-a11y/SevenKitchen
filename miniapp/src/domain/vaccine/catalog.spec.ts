import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  VACCINE_COMPONENT_FALLBACK,
  componentLabelOf,
  componentOptionsOf,
  filterCatalogProducts,
  findCatalogProduct,
  isRabiesName,
  isSuspiciousDate,
  normalizeProductName,
  productComponentLabels,
  readCatalogProducts,
  readComponentOptions,
  scanRowReview,
} from './catalog';

/**
 * ══ 疫苗板块 · 词表层（2026-10-15 重构）══════════════════════════════════
 *
 * 技术方案《四、前端结构》：`domain/vaccine/catalog.ts` = 病种/产品词表，
 * **兜底也来自接口**（权威在后端，随 `/dogs/vaccines/catalog` 下发）。
 *
 * 这组测试盯三件事：
 *   ① 兜底那份**不许与后端权威定义漂开**（同序、同文案）；
 *   ② 谁都不许自己再写一份毒株列表；
 *   ③ 识别结果"哪几行要核对"的三条判据（需求 5.4 / 技术方案 3.3）。
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

describe('疫苗 · 病种词表（兜底必须与后端逐项一致）', () => {
  it('🔴 共享兜底必须与**后端权威定义**逐项一致（含顺序与文案）', () => {
    /*
     * 权威定义在后端的 `domain/health/vaccine/products.ts`（`VACCINE_COMPONENTS` +
     * `VACCINE_COMPONENT_LABELS`），随 `/dogs/vaccines/catalog` 下发 ——
     * 界面平时用的就是它。共享兜底只在"接口失败"时顶上，
     * **所以它必须和后端逐字一致**，否则接口一挂、界面就会显示成另一个名字。
     */
    const backend = read('../backend/src/domain/health/vaccine/products.ts');

    const orderMatch = /export const VACCINE_COMPONENTS[^=]*=\s*\[([\s\S]*?)\]/.exec(backend);
    const labelsMatch = /export const VACCINE_COMPONENT_LABELS[^=]*=\s*\{([\s\S]*?)\}/.exec(backend);
    expect(orderMatch).not.toBeNull();
    expect(labelsMatch).not.toBeNull();

    const backendOrder = (orderMatch![1].match(/'([a-z]+)'/g) || []).map((item) => item.replace(/'/g, ''));
    const backendLabels: Record<string, string> = {};
    for (const line of labelsMatch![1].split('\n')) {
      const m = /([a-z]+):\s*'([^']+)'/.exec(line);
      if (m) backendLabels[m[1]] = m[2];
    }

    // 顺序一致
    expect(VACCINE_COMPONENT_FALLBACK.map((item) => item.value)).toEqual(backendOrder);
    // 文案一致（逐项）
    for (const option of VACCINE_COMPONENT_FALLBACK) {
      expect(option.label).toBe(backendLabels[option.value]);
    }
  });

  it('🔴 界面文件都不许**自己再写一份**毒株列表', () => {
    const files = [
      'src/components/dog-profile/HealthDocumentScan.vue',
      'src/components/vaccine/RecordEditor.vue',
      'src/components/vaccine/ScanConfirm.vue',
      'src/components/vaccine/VaccineTab.vue',
    ];
    for (const file of files) {
      const source = read(file);
      /*
       * 判据：文件里不许出现"自己造的毒株数组"——
       * 形如 `{ value: 'cdv', label: '犬瘟热' }` 的字面量。
       * 需要列表就 import 共享那份。
       */
      const ownList = /\{\s*value:\s*'(cdv|cpv|cav|rabies|lepto|cpi|ccov|bordetella|lyme)'\s*,\s*label:/.test(
        source,
      );
      expect(ownList, `${file} 自己写了一份毒株列表`).toBe(false);
    }
  });

  it('值→中文名只有一份实现（查不到时不许显示成英文码）', () => {
    // 接口下发的那份优先
    expect(componentLabelOf([{ value: 'cpv', label: '接口来的名字' }], 'cpv')).toBe('接口来的名字');
    // 接口没给这个毒株（后端新加、前端没更新）→ 退到共享兜底
    expect(componentLabelOf([], 'cpv')).toBe('犬细小病毒');
    // 谁都不认识 → 原样显示，不显示成 undefined
    expect(componentLabelOf([], 'brand-new')).toBe('brand-new');
  });

  it('词表：接口给了就用接口的，没给才用兜底', () => {
    const fromApi = [{ value: 'x', label: '接口' }];
    expect(componentOptionsOf(fromApi)).toBe(fromApi);
    expect(componentOptionsOf([])).toBe(VACCINE_COMPONENT_FALLBACK);
    expect(componentOptionsOf(undefined)).toBe(VACCINE_COMPONENT_FALLBACK);
  });

  it('接口下发的目录读得出来；读不到时退兜底/空表，不报错', () => {
    expect(readComponentOptions({ components: [{ value: 'cdv', label: '犬瘟热' }] })).toEqual([
      { value: 'cdv', label: '犬瘟热' },
    ]);
    // 老形状 `{ cdv: '犬瘟热' }` 也认
    expect(readComponentOptions({ components: { cdv: '犬瘟热' } as never })).toEqual([
      { value: 'cdv', label: '犬瘟热' },
    ]);
    expect(readComponentOptions(null)).toEqual([]);
    expect(readComponentOptions(undefined)).toEqual([]);

    expect(readCatalogProducts({ products: [{ name: '卫佳捌', components: ['cdv', 'lepto'] }] })).toEqual([
      { name: '卫佳捌', components: ['cdv', 'lepto'], manufacturer: undefined, recommendable: undefined },
    ]);
    expect(readCatalogProducts({ products: [{ components: ['cdv'] } as never] })).toEqual([]);
    expect(readCatalogProducts(null)).toEqual([]);
  });
});

describe('疫苗 · 产品名归一化（与后端同一套规则）', () => {
  const products = [
    { name: '宠必威幼犬保', components: ['cdv', 'cpv'] },
    { name: '卫佳捌', components: ['cdv', 'cpv', 'cav', 'lepto'] },
  ];

  it('去掉 ® / 空格 / 分隔符之后比得中（老板 2026-10-06 报的那个 bug）', () => {
    expect(normalizeProductName('宠必威® 幼犬保')).toBe('宠必威幼犬保');
    expect(findCatalogProduct(products, '宠必威® 幼犬保')?.name).toBe('宠必威幼犬保');
    expect(findCatalogProduct(products, '卫佳-捌')?.name).toBe('卫佳捌');
    // 认不出就是 null —— 不猜（猜错会让家长以为这针含了他没打的病种）
    expect(findCatalogProduct(products, '某种没见过的苗')).toBeNull();
    expect(findCatalogProduct(products, '')).toBeNull();
  });

  it('"从产品库选"面板按关键字筛；空关键字给前几条', () => {
    expect(filterCatalogProducts(products, '卫佳').map((item) => item.name)).toEqual(['卫佳捌']);
    expect(filterCatalogProducts(products, '').length).toBe(2);
  });

  it('目录查得到才写"含 …"，查不到就不写（绝不猜）', () => {
    expect(productComponentLabels(products, '卫佳捌')).toEqual([
      '犬瘟热',
      '犬细小病毒',
      '犬腺病毒',
      '钩端螺旋体',
    ]);
    expect(productComponentLabels(products, '某种没见过的苗')).toEqual([]);
  });
});

/**
 * 识别结果"哪几行要核对"（需求 5.4 / 技术方案 3.3）——
 * 收敛成三条判据：① 狂犬一律 ② 名称在产品库里认不出 ③ 日期可疑。
 */
describe('疫苗 · 识别结果哪几行要核对', () => {
  const products = [{ name: '卫佳捌', components: ['cdv', 'cpv', 'cav', 'lepto'] }];
  const today = '2026-10-15';

  it('① 狂犬一律要核对 —— 错认成"打过了"会让狗漏打', () => {
    expect(isRabiesName('狂犬疫苗')).toBe(true);
    expect(isRabiesName('Rabies')).toBe(true);
    expect(isRabiesName('卫佳捌', products)).toBe(false);

    const review = scanRowReview({ name: '狂犬疫苗', date: '2026-10-01' }, products, today);
    expect(review.needsReview).toBe(true);
    expect(review.reason).toBe('狂犬这一针请对照疫苗本核对一下');
  });

  it('② 名称在产品库里认不出 → 要核对', () => {
    const review = scanRowReview({ name: '某种没见过的苗', date: '2026-10-01' }, products, today);
    expect(review.needsReview).toBe(true);
    expect(review.reason).toBe('常见疫苗里没找到这个名字，请对照疫苗本核对');
  });

  it('③ 日期可疑（没读出来 / 不是日期 / 落在未来）→ 要核对', () => {
    expect(isSuspiciousDate('', today)).toBe(true);
    expect(isSuspiciousDate('2026-8-1', today)).toBe(true);
    expect(isSuspiciousDate('2027-01-01', today)).toBe(true);
    expect(isSuspiciousDate('2026-10-01', today)).toBe(false);

    const review = scanRowReview({ name: '卫佳捌', date: '2027-01-01' }, products, today);
    expect(review.needsReview).toBe(true);
    expect(review.reason).toBe('日期看着不对，请对照疫苗本核对');
  });

  it('三条都不成立才不用核对（正常的识别结果不该反复打扰家长）', () => {
    const review = scanRowReview({ name: '卫佳捌', date: '2026-10-01' }, products, today);
    expect(review.needsReview).toBe(false);
    expect(review.reason).toBe('');
  });

  it('名字整段没读出来 → 要核对，并说清缺什么', () => {
    const review = scanRowReview({ name: '', date: '2026-10-01' }, products, today);
    expect(review.needsReview).toBe(true);
    expect(review.reason).toBe('没读出疫苗名称，请对照疫苗本填一下');
  });
});
