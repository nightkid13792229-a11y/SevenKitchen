import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  normalizeNutritionProfile,
  normalizeNutritionProfileCached,
} from '../../../src/domain/ingredient/nutrition-profile.utils';
import type { NutritionProfile } from '../../../src/domain/ingredient/types';

/**
 * 归一化缓存的**守卫测试**（2026-10-16，批次 0）。
 *
 * ## 背景
 *
 * 配方编辑器在浏览器里跑整套营养评估，而评估的取数层会**反复**归一化同一份档案：
 *   · `nutrition-profile-reader.ts` 的三个读函数各归一化一次；
 *   · `nutrition-field-catalog.getNutritionProfileFieldValue` 里还会再归一化一次。
 * 一次评估 = 食材数 × 目标营养素数（实测 137 条）次取值。
 *
 * 实测（60 轮平均，真实 137 条目标）：
 *   3 个食材  ~37ms → ~2.7ms
 *   8 个食材 ~104ms → ~5.3ms
 *  15 个食材 ~202ms → ~9.6ms   （约 21 倍）
 *
 * ## 为什么这里的断言**不用墙上时钟**
 *
 * 第一版守卫写的是"15 个食材 < 5ms"。实测发现：
 *   · 单独跑这个文件：9.6ms
 *   · 跟着全量套件并行跑：28.7ms（几十个 suite 抢 CPU）
 * 也就是说**耗时断言会随机器负载漂移，必然变成随机红灯** ✗。
 *
 * 所以主守卫换成三条**确定性**判据：
 *   ① 同一个对象第二次归一化**返回同一个引用**（缓存真的生效）；
 *   ② 结果被**冻结**（缓存共享后不会被谁改写串数据）；
 *   ③ **逐字段等价**：缓存版与原始版输出完全一致（快可以，但不能算错）。
 * 再加一条**源码守卫**防止有人把调用点改回未缓存版本。
 * 墙上时钟只留一条阈值很宽的冒烟（抓灾难性回归，不抓百分比）。
 */

/** 剥掉注释 —— 见下方"为什么必须剥"的说明 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const BACKEND_ROOT = resolve(__dirname, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(join(BACKEND_ROOT, relativePath), 'utf8');
}

/** 造一份字段齐全的档案（贴近真实食材） */
function makeProfile(): NutritionProfile {
  return {
    meta: { rawBasisType: 'PER_100_G' },
    macros: {
      energyKcal: 200,
      moisture: 65,
      crudeProtein: 20,
      crudeFat: 10,
      ash: 1,
      carbohydrate: 3,
      fiber: 1,
      solubleFiber: null,
      insolubleFiber: null,
    },
    minerals: {
      calcium: 120,
      phosphorus: 150,
      potassium: 200,
      sodium: 40,
      magnesium: 20,
      chloride: 60,
      iron: 2,
      zinc: 3,
      copper: 0.5,
      manganese: 0.4,
      selenium: 0.02,
      iodine: 0.05,
    },
    vitamins: {
      vitaminA: 900,
      vitaminD: 10,
      vitaminE: 12,
    },
    fattyAcids: {
      linoleicAcid: 2,
      alphaLinolenicAcid: 0.3,
    },
    aminoAcids: {
      arginine: 1.2,
      lysine: 1.3,
    },
    customItems: [],
  } as unknown as NutritionProfile;
}

describe('归一化缓存 · 守卫', () => {
  describe('① 缓存生效（同一对象返回同一引用）', () => {
    it('同一个档案对象，第二次归一化返回同一个引用', () => {
      const profile = makeProfile();

      const first = normalizeNutritionProfileCached(profile);
      const second = normalizeNutritionProfileCached(profile);

      expect(first).not.toBeNull();
      expect(second).toBe(first);
    });

    it('不同档案对象不会互相串（各自独立缓存）', () => {
      const first = normalizeNutritionProfileCached(makeProfile());
      const second = normalizeNutritionProfileCached(makeProfile());

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(second).not.toBe(first);
    });

    it('空值照旧返回 null，不进缓存也不报错', () => {
      expect(normalizeNutritionProfileCached(null)).toBeNull();
      expect(normalizeNutritionProfileCached(undefined)).toBeNull();
    });
  });

  describe('② 结果被冻结（共享之后不会被改写串数据）', () => {
    it('顶层与 5 个 tab 都不可写', () => {
      const normalized = normalizeNutritionProfileCached(makeProfile());
      expect(normalized).not.toBeNull();

      expect(Object.isFrozen(normalized)).toBe(true);
      expect(Object.isFrozen(normalized!.meta)).toBe(true);
      expect(Object.isFrozen(normalized!.macros)).toBe(true);
      expect(Object.isFrozen(normalized!.minerals)).toBe(true);
      expect(Object.isFrozen(normalized!.vitamins)).toBe(true);
      expect(Object.isFrozen(normalized!.fattyAcids)).toBe(true);
      expect(Object.isFrozen(normalized!.aminoAcids)).toBe(true);
    });

    it('真去改写会抛错，而不是静默改掉（缓存被污染才是最难查的 bug）', () => {
      const normalized = normalizeNutritionProfileCached(makeProfile())!;

      expect(() => {
        (normalized.macros as Record<string, unknown>).crudeProtein = 999;
      }).toThrow();
    });
  });

  describe('③ 输出等价（快可以，但不能算错）', () => {
    it('缓存版与原始版逐字段一致', () => {
      const profile = makeProfile();

      const cached = normalizeNutritionProfileCached(profile);
      const plain = normalizeNutritionProfile(profile);

      expect(cached).toEqual(plain);
    });

    it('legacy（items[]）形态也一致', () => {
      const legacy = {
        items: [
          {
            basisType: 'PER_100_G',
            nutrients: { crudeProtein: 20, crudeFat: 10 },
          },
        ],
      } as unknown as NutritionProfile;

      expect(normalizeNutritionProfileCached(legacy)).toEqual(
        normalizeNutritionProfile(legacy),
      );
    });
  });

  describe('④ 源码守卫：读路径不许改回未缓存版本', () => {
    /**
     * ⚠️ **必须剥注释再判断**。
     *
     * 这条守卫第一次写出来时是直接 `includes('normalizeNutritionProfile(')`，
     * 结果被**它自己要保护的那段说明文字**骗了 ——
     * 读取模块的文件头就写着"不要改回 `normalizeNutritionProfile`"，
     * 于是注释一存在，断言恒为红 ✗。
     *
     * 这个坑本项目 2026-10-14 一天之内踩过四次（见
     * `miniapp/src/architecture/source-text.ts` 的文档头）：
     * **凡是"源码里不许出现某个说法"的断言，一律先剥注释**。
     */
    const readPathFiles = [
      'src/domain/recipe-designer/nutrition-profile-reader.ts',
      'src/domain/ingredient/nutrition-field-catalog.ts',
    ];

    it.each(readPathFiles)('%s 不直接调用未缓存的归一化', (file) => {
      const code = stripComments(readSource(file));

      expect(code).not.toMatch(/\bnormalizeNutritionProfile\s*\(/);
      expect(code).toMatch(/normalizeNutritionProfileCached\s*\(/);
    });

    it('剥注释这件事本身是有效的（否则上面两条等于没测）', () => {
      const raw = readSource(readPathFiles[0]);
      const stripped = stripComments(raw);

      // 注释里**提到过**未缓存版本的名字……
      expect(raw).toContain('normalizeNutritionProfile');
      // ……但剥掉注释后，代码里只剩缓存版
      expect(stripped).not.toMatch(/\bnormalizeNutritionProfile\s*\(/);
    });
  });

  describe('⑤ 冒烟：耗时没有灾难性回归（阈值刻意放宽，不做精细断言）', () => {
    it('2000 次归一化在同一次运行里应远快于逐次重建', () => {
      const profile = makeProfile();
      const rounds = 2000;

      const started = process.hrtime.bigint();
      for (let index = 0; index < rounds; index += 1) {
        normalizeNutritionProfileCached(profile);
      }
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

      /**
       * 2000 次、同一对象、纯缓存命中 —— 实测在 1ms 量级。
       * 阈值放到 200ms：即便并行跑被抢 CPU，也不该到 0.1ms/次。
       * 真出现"缓存失效"级别的回归（每次都重建），这里会直接爆掉。
       */
      expect(elapsedMs).toBeLessThan(200);
    });
  });
});
