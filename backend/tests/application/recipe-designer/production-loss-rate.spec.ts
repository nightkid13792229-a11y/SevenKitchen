import { Test } from '@nestjs/testing';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 生产损耗率必须**读配置**（2026-10-16 批次 5.7）
 *
 * ## 这条守卫守的是一个存在了很久的不一致
 *
 * 同一道食谱，**从哪个入口发布，顾客要买的量差 2%**：
 *   · 设计器发布（`recipe-designer.service.ts`）写死 **1.05**
 *   · 后台订单页建食谱（`admin-custom-recipe.controller.ts`）写死 **1.07**
 * 而采购量就是按这个值算的 —— 顾客照着买，多买少买都不对。
 *
 * ## 为什么这不是"要老板拍板的口径"
 *
 * `CustomRecipeConfig.productionLossRate` 这个配置字段**本来就是为统一它加的**
 * （`schema.prisma` 里写着："此前它们散落在代码里写死 —— 有的还写死在两处
 * 且值不一样（见 productionLossRate）"）。
 * 也就是说：**字段加了，两处写死的值一直没改成读它** —— 是一个没做完的重构。
 *
 * ## 为什么单独一条测试
 *
 * 两个服务里配置都是 `@Optional()` 注入的。`@Optional()` 的特点是
 * **依赖解析不到就静默给 undefined** —— 于是"以为改成读配置了，
 * 其实 DI 没接上、一直走回落值"这种情况**不会报错、也不会被现有测试发现**。
 * 所以必须有一条测试**明确断言配置的值真的被用上了**。
 */
describe('生产损耗率读配置', () => {
  const CONFIG_VALUE = 1.12;

  /**
   * 手工构造。
   *
   * ⚠️ 参数**个数和顺序**要对上构造函数：
   * `prisma, targetProvider, searchGovernance?, aiDesignSuggestion?,
   *  recipeAiWizard?, allergenVocabulary?, customRecipeConfig?` —— 一共 7 个。
   * 我第一版按 8 个传，配置落到了不存在的第 8 位，于是"配置没被用上"，
   * **测试红了，但红的原因是测试自己写错了**。
   */
  function makeService(prisma: unknown, config: unknown) {
    return new RecipeDesignerService(
      prisma as never,
      { getTargets: jest.fn() } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      config as never,
    );
  }

  it('配置给了值 → 用它（不是写死的 1.05）', async () => {
    const config = {
      getConfig: jest.fn().mockResolvedValue({ productionLossRate: CONFIG_VALUE }),
    };
    const service = makeService({}, config);

    const value = await (
      service as unknown as { resolveProductionLossRate: () => Promise<number> }
    ).resolveProductionLossRate();

    expect(value).toBe(CONFIG_VALUE);
    expect(value).not.toBe(1.05);
  });

  it('配置服务不存在（@Optional 没接上）→ 回落到原来的 1.05', async () => {
    const service = makeService({}, undefined);

    const value = await (
      service as unknown as { resolveProductionLossRate: () => Promise<number> }
    ).resolveProductionLossRate();

    /**
     * 回落值刻意保留 1.05 而不是改成 1.07：
     * **这个文件的既有行为不动** —— 配置正常时两边一致，
     * 配置异常时各自保持原样，不会因为"修一个不一致"而悄悄改掉数值。
     */
    expect(value).toBe(1.05);
  });

  it('配置里的值不合法（< 1）→ 回落，不把荒谬的值写进库', async () => {
    /**
     * 损耗率是 ≥1 的**系数**（1.07 = 损耗 7%）。
     * 小于 1 意味着"做出来比投料还多"，物理上不成立。
     * 这种值一旦写进食谱，采购量会比实际用量还少 —— 顾客必然买不够。
     */
    for (const bad of [0.8, 0, -1, Number.NaN]) {
      const config = {
        getConfig: jest.fn().mockResolvedValue({ productionLossRate: bad }),
      };
      const service = makeService({}, config);
      const value = await (
        service as unknown as {
          resolveProductionLossRate: () => Promise<number>;
        }
      ).resolveProductionLossRate();
      expect(value).toBe(1.05);
    }
  });

  it('读配置抛错 → 回落，不让整个发布流程挂掉', async () => {
    const config = {
      getConfig: jest.fn().mockRejectedValue(new Error('数据库连接失败')),
    };
    const service = makeService({}, config);

    const value = await (
      service as unknown as { resolveProductionLossRate: () => Promise<number> }
    ).resolveProductionLossRate();

    expect(value).toBe(1.05);
  });

  it('★ 依赖注入真的接上了（@Optional 静默失败会被这条抓住）', async () => {
    /**
     * 这条用 **Nest 的 testing module** 走一遍真实注入，
     * 而不是手工 new —— 手工 new 永远能"接上"，
     * 而真正会出问题的是 Nest 的容器解析。
     */
    const config = {
      getConfig: jest.fn().mockResolvedValue({ productionLossRate: CONFIG_VALUE }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipeDesignerService,
        { provide: PrismaService, useValue: {} },
        // targetProvider 是必填依赖（不是 @Optional），少了它 Nest 直接报错
        { provide: 'FediafTargetProvider', useValue: { getTargets: jest.fn() } },
        { provide: CustomRecipeConfigService, useValue: config },
      ],
    }).compile();

    const service = moduleRef.get(RecipeDesignerService);
    const value = await (
      service as unknown as { resolveProductionLossRate: () => Promise<number> }
    ).resolveProductionLossRate();

    expect(value).toBe(CONFIG_VALUE);
  });
});
