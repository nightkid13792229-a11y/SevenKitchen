import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 回填脚本 · 字段名守卫（2026-10-16，批次 1.6.3）
 *
 * ## 为什么要有这条测试
 *
 * 我写第一版回填脚本时，凭印象用了三个**不存在**的字段名：
 *
 *   · `preparation`      → 实际叫 `preparationMethod`
 *   · `weightG`          → 实际叫 `exampleWeight`
 *   · `isSupplement`     → **根本没有这个列**，要从原料类型推（`SUPPLEMENT`）
 *
 * 这类错**类型检查抓不到**（脚本不在 `tsconfig.build.json` 里），
 * 而且运行时会静默拿到 `undefined` —— 回填出来的快照里食材名全是"未知食材"、
 * 补充剂全被判成普通食材，**但脚本会显示"成功"**。
 *
 * 这正是项目规则「禁止想象字段名」要防的事。所以把字段名钉在这里。
 */

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readProjectFile(relativePath: string): string {
  return readFileSync(join(__dirname, '../..', relativePath), 'utf8');
}

describe('回填脚本 · 字段名必须是 schema 里真实存在的', () => {
  const schema = readProjectFile('prisma/schema.prisma');
  const backfill = stripComments(
    readProjectFile('scripts/backfill-custom-recipe-deliveries.ts'),
  );

  it('★ 用 preparationMethod，不是 preparation', () => {
    // 先确认 schema 里确实叫这个
    expect(schema).toMatch(/preparationMethod\s+String\?\s+@map\("preparation_method"\)/);
    expect(backfill).toMatch(/item\.preparationMethod/);
    // 不许出现"想象出来的"那个名字
    expect(backfill).not.toMatch(/item\.preparation\b/);
  });

  it('★ 用 exampleWeight，不是 weightG', () => {
    expect(schema).toMatch(/exampleWeight\s+Float\?\s+@map\("example_weight"\)/);
    expect(backfill).toMatch(/item\.exampleWeight/);
    expect(backfill).not.toMatch(/item\.weightG/);
  });

  it('★ 补充剂要从原料类型推，因为 RecipeItem 上根本没有 isSupplement 列', () => {
    // 先证明"没有这个列"——如果哪天加了，这条守卫会提醒我们改回来
    const recipeItemBlock = schema.slice(
      schema.indexOf('model RecipeItem {'),
      schema.indexOf('model RecipeSupplementAlternative {'),
    );
    expect(recipeItemBlock).not.toMatch(/^\s+isSupplement\s/m);

    // 所以必须走 ingredient.type
    expect(backfill).toMatch(/ingredient\?\.type === 'SUPPLEMENT'/);
    // 而且查询里必须把 ingredient 带出来（漏了 include 就永远是 undefined）
    expect(backfill).toMatch(/include:\s*\{\s*ingredient:\s*true\s*\}/);
  });

  it('Recipe 上被用到的列都真实存在', () => {
    const recipeBlock = schema.slice(
      schema.indexOf('model Recipe {'),
      schema.indexOf('model RecipeItem {'),
    );
    for (const column of [
      'coverImageUrl',
      'nutritionStandard',
      'energyDensityKcalPerKg',
      'version',
    ]) {
      expect({ column, ok: new RegExp(`^\\s+${column}\\s`, 'm').test(recipeBlock) })
        .toEqual({ column, ok: true });
    }
  });

  it('交付单上被写到的列都真实存在', () => {
    const deliveryBlock = schema.slice(
      schema.indexOf('model CustomRecipeDelivery {'),
      schema.indexOf('model CustomRecipeAftersale {'),
    );
    for (const column of [
      'orderId',
      'version',
      'recipeId',
      'recipeVersion',
      'contentSnapshot',
      'deliveredBy',
      'deliveredAt',
      'notifyStatus',
    ]) {
      expect({
        column,
        ok: new RegExp(`^\\s+${column}\\s`, 'm').test(deliveryBlock),
      }).toEqual({ column, ok: true });
    }
  });
});

describe('回填脚本 · 安全设计', () => {
  const backfill = stripComments(
    readProjectFile('scripts/backfill-custom-recipe-deliveries.ts'),
  );

  it('★ 默认只预演，必须显式 --apply 才写库', () => {
    expect(backfill).toMatch(/process\.argv\.includes\('--apply'\)/);
    // 写库那一段必须在 shouldApply 判断之后
    const guardIndex = backfill.indexOf('if (!shouldApply)');
    const writeIndex = backfill.indexOf('customRecipeDelivery.create');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(guardIndex);
  });

  it('★ 幂等：已有交付记录的订单要跳过', () => {
    expect(backfill).toMatch(/order\.deliveries\.length > 0/);
    expect(backfill).toMatch(/skippedAlreadyHasDelivery/);
  });

  it('★ 只处理已交付/已完成 + 挂着食谱的订单', () => {
    expect(backfill).toMatch(/CustomRecipeStatus\.DELIVERED/);
    expect(backfill).toMatch(/CustomRecipeStatus\.COMPLETED/);
    expect(backfill).toMatch(/recipeId:\s*\{\s*not:\s*null\s*\}/);
  });

  it('★ 快照时间用原交付时间，不是脚本运行时间', () => {
    // generatedAt 必须来自 deliveredAt 参数，不能是 new Date()
    expect(backfill).toMatch(/generatedAt:\s*deliveredAt\.toISOString\(\)/);
    expect(backfill).toMatch(/order\.deliveredAt \?\? order\.updatedAt/);
  });

  it('★ 不补发通知（顾客早就拿到了，再推一条只会困惑）', () => {
    expect(backfill).toMatch(/notifyStatus:\s*'SKIPPED_BACKFILL'/);
  });

  it('回填的记录带来源标记，便于日后区分', () => {
    expect(backfill).toMatch(/backfilled:\s*true/);
    expect(backfill).toMatch(/BACKFILL_ACTOR/);
  });
});

describe('校验脚本', () => {
  const verify = stripComments(
    readProjectFile('scripts/verify-custom-recipe-deliveries.ts'),
  );

  it('三个关键问题都查：漏没漏、版本号连不连、快照能不能用', () => {
    expect(verify).toMatch(/缺少交付记录/);
    expect(verify).toMatch(/版本号不连续/);
    expect(verify).toMatch(/快照缺失/);
  });

  it('版本号必须从 1 连续到 n', () => {
    expect(verify).toMatch(/expected/);
    expect(verify).toMatch(/index \+ 1/);
  });

  it('有问题时退出码非 0（能被部署脚本/CI 抓到）', () => {
    expect(verify).toMatch(/process\.exitCode = 1/);
  });
});
