import { Test } from '@nestjs/testing';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { GlobalConfigService } from '../../../src/application/config/global-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 新建食谱的生产损耗率必须**读全局配置**（2026-10-21）
 *
 * ## 历史
 *
 * 这个值原先有两个来源：设计器发布写死 1.05、后台订单页建食谱写死 1.07，
 * 于是同一道食谱从哪个入口发布，顾客要买的量差 2%。
 * 2026-10-16 加了 `CustomRecipeConfig.productionLossRate`，两处改成读它；
 * 2026-10-21 又整体迁到 `GlobalConfig.productionLossRate`（后台「全局配置」）。
 *
 * ## 为什么单独一条测试
 *
 * 服务里的配置依赖是 `@Optional()` 注入的。`@Optional()` 的特点是
 * **依赖解析不到就静默给 undefined** —— 于是"以为改成读配置了，
 * 其实 DI 没接上、一直走回落值"这种情况**不会报错、也不会被现有测试发现**。
 * 所以必须有一条测试**明确断言配置的值真的被用上了**。
 *
 * ⚠️ 这条只覆盖“新建食谱”；已有 `Recipe.productionLossRate` 与交付快照
 * 保持原值，不因全局配置改动而回溯。
 */
describe('生产损耗率读全局配置', () => {
  const CONFIG_VALUE = 1.12;

  /**
   * 手工构造。
   *
   * ⚠️ 参数**个数和顺序**要对上构造函数：
   * `prisma, targetProvider, searchGovernance?, aiDesignSuggestion?,
   *  recipeAiWizard?, allergenVocabulary?, globalConfigService?` —— 一共 7 个。
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

  const globalConfigMock = (productionLossRate: unknown) => ({
    getGlobalConfig: jest.fn().mockResolvedValue({ productionLossRate }),
  });

  async function resolve(service: RecipeDesignerService) {
    return (
      service as unknown as {
        resolveProductionLossRate: () => Promise<number>;
      }
    ).resolveProductionLossRate();
  }

  it('全局配置给了值 → 用它（不是写死的 1.05 / 1.07）', async () => {
    const service = makeService({}, globalConfigMock(CONFIG_VALUE));

    const value = await resolve(service);

    expect(value).toBe(CONFIG_VALUE);
    expect(value).not.toBe(1.05);
    expect(value).not.toBe(1.07);
  });

  it('全局配置服务不存在（@Optional 没接上）→ 回落到 1.07', async () => {
    const service = makeService({}, undefined);

    await expect(resolve(service)).resolves.toBe(1.07);
  });

  it('配置里的值不合法（<1 或 >2）→ 回落 1.07，不把荒谬的值写进库', async () => {
    /**
     * 损耗率是 ≥1 的**系数**（1.07 = 损耗 7%）。
     * 小于 1 意味着"做出来比投料还多"，物理上不成立；
     * 大于 2 只可能是填错了。这种值一旦写进食谱，采购量会算错。
     */
    for (const bad of [0.8, 0, -1, 2.5, Number.NaN]) {
      const service = makeService({}, globalConfigMock(bad));
      await expect(resolve(service)).resolves.toBe(1.07);
    }
  });

  it('读全局配置抛错 → 回落 1.07，不让整个发布流程挂掉', async () => {
    const config = {
      getGlobalConfig: jest.fn().mockRejectedValue(new Error('数据库连接失败')),
    };
    const service = makeService({}, config);

    await expect(resolve(service)).resolves.toBe(1.07);
  });

  it('★ 依赖注入真的接上了（@Optional 静默失败会被这条抓住）', async () => {
    /**
     * 这条用 **Nest 的 testing module** 走一遍真实注入，
     * 而不是手工 new —— 手工 new 永远能"接上"，
     * 而真正会出问题的是 Nest 的容器解析。
     */
    const config = globalConfigMock(CONFIG_VALUE);

    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipeDesignerService,
        { provide: PrismaService, useValue: {} },
        // targetProvider 是必填依赖（不是 @Optional），少了它 Nest 直接报错
        {
          provide: 'FediafTargetProvider',
          useValue: { getTargets: jest.fn() },
        },
        { provide: GlobalConfigService, useValue: config },
      ],
    }).compile();

    const service = moduleRef.get(RecipeDesignerService);

    await expect(resolve(service)).resolves.toBe(CONFIG_VALUE);
  });
});
