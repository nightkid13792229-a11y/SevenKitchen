/**
 * 疫苗板块的应急开关（2026-10-16 上线前风险控制 B4）
 *
 * 场景：上线后万一发现接种建议算错了，唯一的救命手段就是**一分钟内关掉**
 * 整个疫苗板块 —— 而不是改代码 → 重新发版 → 等审核（几小时到一天 ✗）。
 *
 * 这组用例钉住三件事：
 *   ① 开关挂在**已有的**单例配置表上，用**已有的 admin 接口**就能改（不新建表）
 *   ② 小程序拿到的是一个**公开只读**的极简接口：只有 `{ enabled, notice }`
 *      （公开 = 未登录也能问；只读 = 没有任何"改"的口子）
 *   ③ 默认值：库里读不到 → **开**（保持线上现状；关掉是人为动作，不会自己发生）
 *      ⚠️ 小程序那条"拉不到就按关处理"的兜底在小程序侧，两条默认值方向相反、
 *         各有各的理由（见 miniapp/src/utils/vaccine-feature.ts）
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { GlobalConfigService } from 'src/application/config/global-config.service';
import { HealthController } from 'src/interfaces/controllers/health.controller';
import { UpdateGlobalConfigDto } from 'src/interfaces/dto/global-config.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

describe('疫苗板块应急开关（后端）', () => {
  const buildService = (row: unknown) => {
    const prisma = {
      globalConfig: {
        findUnique: jest.fn().mockResolvedValue(row),
        upsert: jest.fn().mockImplementation(({ create, update }) => ({
          ...create,
          ...update,
          updatedAt: new Date(),
        })),
      },
    };
    const cosService = { deleteImageByUrl: jest.fn() };
    return {
      prisma,
      service: new GlobalConfigService(prisma as any, cosService as any),
    };
  };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('库里是 false → 返回关（这条就是"一分钟关掉"生效的样子）', async () => {
    const { service } = buildService({
      vaccineFeatureEnabled: false,
      vaccineFeatureNotice: '疫苗功能维护中，今天先不开放',
    });

    await expect(service.getVaccineFeatureFlag()).resolves.toEqual({
      enabled: false,
      notice: '疫苗功能维护中，今天先不开放',
    });
  });

  it('库里是 true → 照常开；没写说明时 notice 是空串（接口形状固定）', async () => {
    const { service } = buildService({
      vaccineFeatureEnabled: true,
      vaccineFeatureNotice: null,
    });

    await expect(service.getVaccineFeatureFlag()).resolves.toEqual({
      enabled: true,
      notice: '',
    });
  });

  it('读不到那一行（或字段为空）时默认**开**：部署那一刻线上行为不变', async () => {
    const { service } = buildService(null);
    await expect(service.getVaccineFeatureFlag()).resolves.toEqual({
      enabled: true,
      notice: '',
    });

    const { service: service2 } = buildService({});
    await expect(service2.getVaccineFeatureFlag()).resolves.toEqual({
      enabled: true,
      notice: '',
    });
  });

  it('公开接口只回 { enabled, notice } 两个字段（不泄露配置表里别的东西）', async () => {
    const globalConfigService = {
      getVaccineFeatureFlag: jest
        .fn()
        .mockResolvedValue({ enabled: false, notice: '维护中' }),
    };
    const controller = new HealthController(globalConfigService as any);

    const response = await controller.getVaccineFeature();

    expect(response.code).toBe(0);
    expect(response.data).toEqual({ enabled: false, notice: '维护中' });
    // 定价 / 毛利这些同表字段绝不能从这个口出去
    expect(Object.keys(response.data as object).sort()).toEqual([
      'enabled',
      'notice',
    ]);
  });

  it('公开接口拿不到开关时**抛错**（不吞成 200）—— 由小程序按"关"兜底', async () => {
    const globalConfigService = {
      getVaccineFeatureFlag: jest.fn().mockRejectedValue(new Error('库连不上')),
    };
    const controller = new HealthController(globalConfigService as any);

    await expect(controller.getVaccineFeature()).rejects.toThrow('库连不上');
  });

  it('admin 接口能改（这是"关掉"的唯一入口，走已有的 PUT /admin/global-config）', async () => {
    const { service, prisma } = buildService({
      vaccineFeatureEnabled: true,
      vaccineFeatureNotice: null,
    });

    await service.updateGlobalConfig({
      vaccineFeatureEnabled: false,
      vaccineFeatureNotice: '今天先关一下，明天再开',
    });

    expect(prisma.globalConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'singleton' },
        update: {
          vaccineFeatureEnabled: false,
          vaccineFeatureNotice: '今天先关一下，明天再开',
        },
      }),
    );
  });

  it('开关只认 true / false：给别的值直接拒绝（不许"关了又被打开"）', async () => {
    const { service } = buildService({ vaccineFeatureEnabled: true });

    await expect(
      service.updateGlobalConfig({ vaccineFeatureEnabled: 'false' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('说明是空串 → 清空那一栏（不是把 false 当成没传）', async () => {
    const { service, prisma } = buildService({ vaccineFeatureEnabled: false });

    await service.updateGlobalConfig({ vaccineFeatureNotice: '   ' } as any);

    expect(prisma.globalConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { vaccineFeatureNotice: null },
      }),
    );
    // ⚠️ 没传的字段一个都不能动（admin-web 那一页保存时会整份提交）
    expect(
      Object.keys(prisma.globalConfig.upsert.mock.calls[0][0].update),
    ).toEqual(['vaccineFeatureNotice']);
  });

  it('admin DTO 收得下这两个字段（校验不拦）', async () => {
    const dto = plainToInstance(UpdateGlobalConfigDto, {
      vaccineFeatureEnabled: false,
      vaccineFeatureNotice: '维护中',
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('admin DTO 挡住明显写错的说明（超过 200 字）', async () => {
    const dto = plainToInstance(UpdateGlobalConfigDto, {
      vaccineFeatureNotice: '很'.repeat(201),
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('🔴 写入口只对员工开放（普通顾客的 token 改不了开关，也改不了定价）', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/interfaces/controllers/global-config.controller.ts',
      ),
      'utf-8',
    );

    // 开关挂在 @Controller('api/v1/admin/global-config') 上，
    // 而那个控制器必须同时有 AuthGuard（登录）与 StaffGuard（员工）
    expect(source).toContain('@UseGuards(AuthGuard, StaffGuard)');
    expect(source).not.toContain('@UseGuards(AuthGuard)\n');
  });
});
