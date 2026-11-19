// `uuid` 在 node_modules 里是 ESM，jest 不转译它；装配整张依赖图时会被顺带引入。
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));

import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AdminFinanceController } from '../src/interfaces/controllers/admin-finance.controller';
import { AdminFinanceV2Controller } from '../src/interfaces/controllers/admin-finance-v2.controller';

/**
 * 启动自检。
 *
 * 为什么要有：2026-11-07 连续两次「本地测试全绿、上线起不来」——
 * 一次是把依赖写成结构类型（运行时被擦成 Object），一次是服务没注册成 provider。
 * 单元测试用的是 mock，这两类问题都照不出来，只有真的把依赖图装配一遍才行。
 */
describe('AppModule 装配', () => {
  let moduleRef: TestingModule | undefined;

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('整个应用的依赖图能装配起来（缺 provider / 类型被擦掉都会在这一步炸）', async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef).toBeDefined();
  });
});

describe('财务控制器注册顺序', () => {
  it('V2 先于旧控制器注册，/admin/finance/templates 命中仅 ADMIN 的 V2', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      AppModule,
    ) as Function[];

    const v2Index = controllers.indexOf(AdminFinanceV2Controller);
    const oldIndex = controllers.indexOf(AdminFinanceController);
    expect(v2Index).toBeGreaterThanOrEqual(0);
    expect(oldIndex).toBeGreaterThanOrEqual(0);
    expect(v2Index).toBeLessThan(oldIndex);
  });
});
