import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateSupplementIngredientDto,
  toCreateSupplementInput,
} from '../../src/interfaces/dto/ingredient-creation/create-supplement-ingredient.dto';

/**
 * 补剂建档接口的入参。
 *
 * 这里只钉两件在入口就会出事的事：每份几粒能不能缺、字段能不能原样带进服务。
 * 剩下的鉴权、路由、组装由 Nest 与 Task 7 的端到端验收兜住。
 */
const body = {
  name: '鱼油（Omega-3）',
  brand: 'Nordic Naturals',
  productModel: '120 粒/瓶',
  purchaseChannel: 'iHerb',
  unitDisplayLabel: '粒',
  physicalForm: 'CAPSULE',
  purchaseUnit: '瓶',
  purchaseToBaseRatio: 120,
  currentPricePerPurchaseUnit: 398,
  addTiming: 'BEFORE_MIXING',
  productionLossRate: 1.05,
  diyEnabled: true,
  procurementEnabled: true,
  labelCategory: 'FEED_ADDITIVE',
  labelNames: ['鱼油'],
  labelNameSource: '饲料添加剂品种目录（2023 版）',
  tagNames: ['油脂类'],
  servingUnitsPerDose: 2,
  servingNutrients: { 'fattyAcids.epa': 650 },
  evidence: { labelText: 'Serving Size 2 Softgels' }
};

async function errorsOf(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateSupplementIngredientDto, payload);
  return validate(dto);
}

describe('CreateSupplementIngredientDto', () => {
  it('完整入参能通过校验', async () => {
    expect(await errorsOf(body)).toHaveLength(0);
  });

  it('每份几粒缺失时校验不过，错误指向该字段', async () => {
    const { servingUnitsPerDose, ...rest } = body;
    void servingUnitsPerDose;
    const errors = await errorsOf(rest);
    expect(errors.map((error) => error.property)).toContain('servingUnitsPerDose');
  });

  it('每份几粒填 0 时校验不过', async () => {
    const errors = await errorsOf({ ...body, servingUnitsPerDose: 0 });
    expect(errors.map((error) => error.property)).toContain('servingUnitsPerDose');
  });

  it('添加时机用了词表外的值时校验不过', async () => {
    const errors = await errorsOf({ ...body, addTiming: 'DURING_PRODUCTION' })
    expect(errors.map((error) => error.property)).toContain('addTiming')
  })

  it('营养素不是数字时映射阶段直接 400，不做类型转换', async () => {
    const dto = plainToInstance(CreateSupplementIngredientDto, {
      ...body,
      servingNutrients: { 'fattyAcids.epa': '650' },
    })
    expect(() => toCreateSupplementInput(dto, 'user-1')).toThrow(BadRequestException)
  })

  it('单位不在白名单里时校验不过', async () => {
    const errors = await errorsOf({ ...body, unitDisplayLabel: '袋' });
    expect(errors.map((error) => error.property)).toContain('unitDisplayLabel');
  });

  it('换算倍数小于等于 0 时校验不过', async () => {
    const errors = await errorsOf({ ...body, purchaseToBaseRatio: 0 });
    expect(errors.map((error) => error.property)).toContain('purchaseToBaseRatio');
  });
});

describe('toCreateSupplementInput', () => {
  it('原样带上每份粒数、营养素与证据，并记下提交人', () => {
    const dto = plainToInstance(CreateSupplementIngredientDto, body);
    const input = toCreateSupplementInput(dto, 'user-1');

    expect(input.servingUnitsPerDose).toBe(2);
    // 服务端收的是「每份」值，折算在服务里做——客户端说了不算
    expect(input.servingNutrients).toEqual({ 'fattyAcids.epa': 650 });
    expect(input.evidence.labelText).toBe('Serving Size 2 Softgels');
    expect(input.createdBy).toBe('user-1');
    expect(input.unitDisplayLabel).toBe('粒');
  });
});
