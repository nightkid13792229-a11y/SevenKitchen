import { Test, TestingModule } from '@nestjs/testing';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';

/**
 * 配置读取的**健壮性**守卫（2026-10-16，批次 1.4）
 *
 * ## 这条测试是怎么来的
 *
 * 把「排期前瞻天数」「占位重试次数」从写死的常量改成从配置读之后，
 * **5 条排期测试当场变红**，报的是「近期定制名额已满」。
 *
 * 根因不是配置读不到（那种情况有 try/catch 兜着），而是：
 * **配置读到了，但那个字段是 undefined** ——
 * 测试里的 mock 只返回了部分字段（真实世界里则是配置表还没升级）。
 * `i < undefined` 恒为 false → 排期循环一次都不执行 → 直接报"没名额"。
 *
 * 这类错很难查：日志上没有异常，只有一句"名额已满"，
 * 而实际上是配置少了一个字段。所以这里把行为**钉死**：
 * **缺字段一律退兜底值，绝不把 undefined 当成 0。**
 */

function buildService(config: unknown): Promise<CustomRecipeService> {
  const module: TestingModule = Test.createTestingModule({
    providers: [
      CustomRecipeService,
      { provide: PrismaService, useValue: {} },
      { provide: TencentCosService, useValue: {} },
      {
        provide: CustomRecipeConfigService,
        useValue: {
          getConfig: jest.fn().mockResolvedValue(config),
        },
      },
    ],
  });

  return module.compile().then((compiled) =>
    compiled.get(CustomRecipeService),
  );
}

/** 通过公开方法间接验证私有解析器的行为（不测私有实现本身） */
describe('配置读取 · 健壮性（批次 1.4）', () => {
  describe('附件限额：配置缺字段时退兜底值', () => {
    it('配置完整时用配置值', async () => {
      const service = await buildService({
        attachmentMaxSizeMb: 20,
        attachmentMaxCount: 6,
      });

      await expect(service.getAttachmentLimits()).resolves.toEqual({
        maxSizeMb: 20,
        maxSizeBytes: 20 * 1024 * 1024,
        maxCount: 6,
      });
    });

    it('★ 配置**一个字段都没给**时退兜底值（不是 0，也不是 NaN）', async () => {
      const service = await buildService({
        feeAmount: 300,
        dailyCapacity: 4,
      });

      const limits = await service.getAttachmentLimits();

      expect(limits.maxSizeMb).toBe(10);
      expect(limits.maxSizeBytes).toBe(10 * 1024 * 1024);
      expect(limits.maxCount).toBe(9);
      // NaN 会让 `file.size > NaN` 恒为 false —— 等于没有上限
      expect(Number.isNaN(limits.maxSizeBytes)).toBe(false);
    });

    it('配置读到 0 或负数时也退兜底值（0 会让任何文件都传不上去）', async () => {
      const service = await buildService({
        attachmentMaxSizeMb: 0,
        attachmentMaxCount: -1,
      });

      const limits = await service.getAttachmentLimits();

      expect(limits.maxSizeMb).toBe(10);
      expect(limits.maxCount).toBe(9);
    });

    it('配置服务整个抛错时也退兜底值（不让上传直接挂掉）', async () => {
      const module = await Test.createTestingModule({
        providers: [
          CustomRecipeService,
          { provide: PrismaService, useValue: {} },
          { provide: TencentCosService, useValue: {} },
          {
            provide: CustomRecipeConfigService,
            useValue: {
              getConfig: jest.fn().mockRejectedValue(new Error('db down')),
            },
          },
        ],
      }).compile();

      const service = module.get(CustomRecipeService);
      await expect(service.getAttachmentLimits()).resolves.toMatchObject({
        maxSizeMb: 10,
        maxCount: 9,
      });
    });
  });
});
