import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * 食谱定制重构 · **四条红线守卫**（2026-10-16 建立，对应执行计划 1.7.2）
 *
 * ## 这四条守卫要防的是什么
 *
 * 这次重构要根治的病是「**改一处漏三处**」：同一个状态码在三个端各写一份中文，
 * 加一个枚举要改六处 —— 2026-10-04 加「已取消」时就漏了两处半，顾客看到英文枚举。
 *
 * 功能测试抓不住这类问题（功能是好的，只是"说法"散落在各处），
 * 所以要用**源码守卫**：机器每天盯着，防止有人又写回去。
 *
 * ## 为什么放在 backend 的测试里
 *
 * 这三条理由都是实测出来的：
 *   ① 这是**跨端**约束（小程序 + 后台 + 后端），backend 是唯一有"全仓视角"的位置；
 *   ② 后端测试套件是**最可靠的那一套**（全量 303 套 / 3169 项，18 秒跑完）；
 *   ③ ⚠️ admin-web 的 `tests/` 目录**根本不在 `npm test` 范围里**
 *      （25 个文件 / 99 个用例，其中 1 个已失败很久没人知道）。
 *      把守卫放在那里等于没放。
 *
 * ## 两条设计原则（都来自本项目踩过的坑）
 *
 * **一、先用 `stripComments` 再判断。**
 *   本项目 2026-10-14 一天之内被同一个坑骗了四次：注释里提到某个词，
 *   断言就误报 —— 而且那些注释恰恰是在解释"为什么不该这么写"，
 *   于是**越解释越误报**。详见 `miniapp/src/architecture/source-text.ts`。
 *   `.vue` 文件还要额外剥模板注释（只剥 JS 注释等于没剥）。
 *
 * **二、存量记录在案，只禁止新增。**
 *   存量违规是长期存在的，一上来要求归零会让守卫**从第一天就是红的**，
 *   然后就没人看了。所以基线写在 `known-redline-violations.json`，
 *   规则是"文件集合不得新增、条数不得新增"，修好之后允许变少。
 */

const REPO_ROOT = resolve(__dirname, '../../..');
const BASELINE_PATH = resolve(
  __dirname,
  'known-redline-violations.json',
);

interface Baseline {
  [key: string]: unknown;
}

const baseline = JSON.parse(
  readFileSync(BASELINE_PATH, 'utf8'),
) as Baseline & {
  [k: string]: any;
};

/** 剥注释 —— 见文件头「设计原则一」 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);

/**
 * 测试文件不算违规。
 *
 * ⚠️ 这条是踩出来的：第一版守卫把 `custom-recipe.regression.spec.ts` 也扫了进去，
 * 里面的**测试夹具**本来就要写出状态码与中文（它就是在断言这些东西），
 * 于是凭空多出 2 处"违规"。守卫报的应该是**生产代码**的问题。
 */
function isTestFile(path: string): boolean {
  return /\.(spec|test)\.[cm]?[jt]sx?$/.test(path);
}

function walk(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full, extensions));
    } else if (
      extensions.some((ext) => name.endsWith(ext)) &&
      !isTestFile(name)
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * 数一处文件里命中某个正则的**次数**。
 *
 * ⚠️ 用**全文匹配**而不是逐行匹配 —— 逐行会漏掉跨行写法。
 * 实测：`orders.vue` 的抵扣兜底是这么写的：
 *
 *     return Math.max(
 *       0,
 *       Number(order.creditAmount || 0) - Number(order.creditUsed || 0),
 *     );
 *
 * 按行扫完全看不到，按全文才抓得到。
 */
function countMatches(file: string, pattern: RegExp): number {
  const code = stripComments(readFileSync(file, 'utf8'));
  const global = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );
  return (code.match(global) ?? []).length;
}

function rel(abs: string): string {
  return relative(REPO_ROOT, abs).split('\\').join('/');
}

/** 扫一组目录，返回「有命中的文件 → 条数」 */
function collect(
  dirs: string[],
  extensions: string[],
  pattern: RegExp,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const dir of dirs) {
    for (const file of walk(resolve(REPO_ROOT, dir), extensions)) {
      const count = countMatches(file, pattern);
      if (count > 0) {
        result[rel(file)] = count;
      }
    }
  }
  return result;
}

/**
 * 通用断言：**不允许新增**。
 *
 * 三条一起判：
 *   ① 总量不得超过基线（同一个文件里多写几处会被抓住）
 *   ② 违规**文件集合**必须是基线的子集（换个新文件写会被抓住）
 *   ③ 基线自己不能是空的（否则守卫等于没写）
 */
function expectNoNewViolations(
  label: string,
  current: Record<string, number>,
  base: { maxTotal: number; files: Record<string, number> },
): void {
  const total = Object.values(current).reduce((sum, n) => sum + n, 0);
  const currentFiles = Object.keys(current).sort();
  const baseFiles = Object.keys(base.files).sort();

  /**
   * 基线可以为 0 —— 那表示**这一组已经清干净了**（2026-10-16 批次 5.1
   * 的"状态码→中文"与"定制目标→中文"两组就是这样）。
   *
   * 但这不等于可以随便清零来绕过：
   *   · 若 `maxTotal = 0` 而 `total > 0`，下面 `total <= maxTotal` 会红；
   *   · 所以"清零"只有在**真的没有违规**时才成立。
   * 原来的 `toBeGreaterThan(0)` 是想防"清零绕过"，但它同时
   * **让守卫无法表达"已经清完了"** —— 于是清完之后基线还得留着假数字，
   * 反而说不清现状。
   */
  expect(base.maxTotal).toBeGreaterThanOrEqual(0);
  expect(total).toBeLessThanOrEqual(base.maxTotal);

  const newFiles = currentFiles.filter((file) => !baseFiles.includes(file));
  expect(newFiles).toEqual([]);

  // 诊断信息：失败时能一眼看出是哪个文件多了
  const grew = currentFiles
    .filter((file) => (current[file] ?? 0) > (base.files[file] ?? 0))
    .map((file) => `${file}: ${base.files[file] ?? 0} → ${current[file]}`);
  expect(grew).toEqual([]);

  if (total > 0) {
    // eslint-disable-next-line no-console
    console.log(`[${label}] 存量违规 ${total} 处（基线 ${base.maxTotal}）`);
  }
}

describe('食谱定制 · 四条红线守卫', () => {
  describe('GD-01 状态流转唯一入口', () => {
    it('后端没有新增「直接写定制单状态」的地方', () => {
      const pattern = /customRecipeOrder\.(update|updateMany)/;
      const current = collect(['backend/src'], ['.ts'], pattern);

      expectNoNewViolations(
        'GD-01',
        current,
        baseline.gd01_status_writes,
      );
    });
  });

  describe('GD-02 前端零硬编码枚举', () => {
    const STATUS_CODES =
      'PENDING_PAYMENT|PAID|IN_PROGRESS|DELIVERED|COMPLETED|CANCELLED';
    const GOAL_CODES =
      'MAINTAIN|GAIN_WEIGHT|LOSE_WEIGHT|HEALTH_SUPPORT';

    /** 只扫「定制板块」相关文件 —— 其它板块的枚举按需求文档 12.4 不在本期范围 */
    const customRecipeDirs = [
      'miniapp/src/pages/custom-recipe',
      'miniapp/src/utils',
      'admin-web/src/views/CustomRecipes',
      'admin-web/src/views/RecipeDesigner/components',
      'admin-web/src/constants',
      'admin-web/src/utils',
    ];

    /**
     * 文件名里不带 custom-recipe，但**确实属于定制板块**的文件。
     *
     * 为什么要显式列出：设计器的「爱犬洞察」面板会展示该狗的定制单需求，
     * 因此它也带着一份定制目标的中文映射 —— 但文件名是 `DogInsightPanel.vue`，
     * 靠命名规则匹配不到。第一版守卫就漏了它（基线凭空少了 4 处）。
     * 显式列出来，比在文档里记一条"已知漏洞"要好。
     */
    const EXTRA_CUSTOM_RECIPE_FILES = [
      'admin-web/src/views/RecipeDesigner/components/DogInsightPanel.vue',
    ];

    /** 只看属于定制板块的文件（命名匹配 + 上面显式列出的） */
    function onlyCustomRecipeFiles(
      found: Record<string, number>,
    ): Record<string, number> {
      const out: Record<string, number> = {};
      for (const [file, count] of Object.entries(found)) {
        if (
          /custom[-_]?recipe/i.test(file) ||
          EXTRA_CUSTOM_RECIPE_FILES.includes(file)
        ) {
          out[file] = count;
        }
      }
      return out;
    }

    it('没有新增「状态码 → 中文」的映射表', () => {
      const pattern = new RegExp(`\\b(${STATUS_CODES})\\s*:\\s*['"\`{]`);
      const found = collect(customRecipeDirs, ['.vue', '.ts'], pattern);
      const current = onlyCustomRecipeFiles(found);

      expectNoNewViolations('GD-02 状态', current, baseline.gd02_status_maps);
    });

    it('没有新增「定制目标 → 中文」的映射表', () => {
      const pattern = new RegExp(`\\b(${GOAL_CODES})\\s*:\\s*['"\`{]`);
      const found = collect(customRecipeDirs, ['.vue', '.ts'], pattern);
      const current = onlyCustomRecipeFiles(found);

      expectNoNewViolations('GD-02 目标', current, baseline.gd02_goal_maps);
    });

    it('剥注释这件事本身是有效的（否则上面两条可能被自己的注释骗）', () => {
      /**
       * 真实例子：`miniapp/src/utils/custom-recipe-order.ts` 里就有一段注释写着
       * 「此前漏了这一档，列表直接把 CANCELLED 显示给顾客」——
       * 它**提到 CANCELLED 这个英文**，但那条注释是正常的。
       * 不剥注释就会误报。
       */
      const raw = readFileSync(
        resolve(REPO_ROOT, 'miniapp/src/utils/custom-recipe-order.ts'),
        'utf8',
      );
      expect(stripComments(raw)).not.toBe(raw);
    });
  });

  describe('GD-03 前端零业务算术', () => {
    it('没有新增「把后端已经给的值在前端再算一遍」', () => {
      /**
       * ⚠️ 这里刻意收得很窄。
       *
       * 一开始想抓"所有金额加减 / 日期相减"，但实测**误报太多**
       * （展示层取整、时间戳格式化，甚至 CSS 类名 `.credit` 都会被误伤）——
       * 那种守卫会被当成噪音关掉，等于白写。
       *
       * 所以只抓**已核实**的这一类形状：`Math.max(0, …credit… - …credit…)`，
       * 也就是"后端已经返回了 creditRemaining，前端还留一份兜底相减"。
       *
       * **已知抓不到的**：`success.vue` 里同类的第三处写成了三元表达式
       * （`x ?? (a !== undefined ? Number(a) - Number(b) : fallback)`），
       * 没有 `Math.max` 包着。宁可少抓这一处，也不要放宽正则去误伤一片。
       * 批次 5 手工清 `creditRemaining` 兜底时三处一起清。
       */
      const pattern =
        /Math\.max\(\s*0\s*,[\s\S]{0,120}?[Cc]redit[\s\S]{0,120}?\)/;
      const dirs = ['miniapp/src/pages/custom-recipe'];
      const found = collect(dirs, ['.vue', '.ts'], pattern);

      expectNoNewViolations(
        'GD-03',
        found,
        baseline.gd03_business_arithmetic,
      );
    });
  });

  describe('GD-04 后端零重复实现（前端不再实现营养评估）', () => {
    it('admin-web 里没有新增营养合规评估引擎的实现', () => {
      const dirs = ['admin-web/src'];
      const found = collect(
        dirs,
        ['.ts'],
        /export function assessRecipeDraft/,
      );

      expectNoNewViolations(
        'GD-04',
        found,
        baseline.gd04_duplicate_assessment,
      );
    });

    it('后端的权威实现仍然在（防止「两边都删了」）', () => {
      const found = collect(
        ['backend/src/domain/recipe-designer'],
        ['.ts'],
        /export function assessRecipeDraft/,
      );

      expect(Object.keys(found).length).toBe(1);
    });
  });

  describe('基线清单自身是可信的', () => {
    it('每一组都写明了「为什么现在还有」和「什么时候清掉」', () => {
      for (const key of [
        'gd01_status_writes',
        'gd02_status_maps',
        'gd02_goal_maps',
        'gd03_business_arithmetic',
        'gd04_duplicate_assessment',
      ]) {
        const entry = baseline[key];
        expect(entry?.why).toBeTruthy();
        expect(entry?.clearAt).toBeTruthy();
        expect(entry?.maxTotal).toBeGreaterThanOrEqual(0);
        /**
         * `files` 为空**只允许在 `maxTotal` 也为 0 时**出现 ——
         * 即"这一组已经清干净"。有违规却把 files 清空是说不通的。
         */
        const fileCount = Object.keys(entry?.files ?? {}).length;
        if (fileCount === 0) {
          expect(entry?.maxTotal).toBe(0);
        } else {
          expect(fileCount).toBeGreaterThan(0);
        }
      }
    });
  });
});
