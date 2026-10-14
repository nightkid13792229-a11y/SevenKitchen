import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  VACCINE_COMPONENT_FALLBACK,
  componentLabelOf,
  componentOptionsOf,
} from './vaccine-fields';

/**
 * ══ 共享字段层（老板 2026-10-14）══════════════════════════════════════════
 *
 * 老板："我想的是，这3个页面可不可以用同一个页面呢？"
 * —— 页面不合并（任务不同：一次核多条 vs 编辑一条），
 *    但"疫苗名 / 含哪些疫苗 / 接种日期"这三样只有一份定义。
 *
 * 这组测试盯的就是"**不许再漂开**"——
 * 2026-10-14 查出来的实证：同一样东西在两处各写一份，
 * 已经漂成 `犬细小`（确认页）和 `犬细小病毒`（录入卡）两个名字。
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

describe('疫苗录入 · 共享字段层（老板 2026-10-14）', () => {
  it('🔴 共享兜底必须与**后端权威定义**逐项一致（含顺序与文案）', () => {
    /*
     * 权威定义在后端的 `vaccine-products.ts`（`VACCINE_COMPONENTS` +
     * `VACCINE_COMPONENT_LABELS`），随 `/dogs/vaccines/catalog` 下发 ——
     * 界面平时用的就是它。共享兜底只在"接口失败"时顶上，
     * **所以它必须和后端逐字一致**，否则接口一挂、两个界面就会显示不同的名字。
     */
    const backend = read('../backend/src/domain/health/vaccine-products.ts');

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

  it('🔴 三个界面都不许**自己再写一份**毒株列表', () => {
    const files = [
      'src/components/dog-profile/HealthDocumentScan.vue',
      'src/components/dog-profile/VaccineRecordCard.vue',
      'src/components/dog-profile/VaccineManagementSection.vue',
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

  it('🔴 值→中文名只有一份实现（查不到时不许显示成英文码）', () => {
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
});
