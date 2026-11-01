import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateSupplementOrderDto } from '../../../src/interfaces/dto/supplement-shop.dto';

/**
 * 下单入参 DTO 的回归测试（2026-11-01）。
 *
 * 为什么必须有这组：控制器用了 `ValidationPipe({ whitelist: true })`，
 * **DTO 上没声明的字段会被静默丢掉** —— 不会报错、不会警告，表现是
 * "功能看起来上线了，实际一行都没执行"。2026-11-01 加的两个字段
 * （expectedTotal / clientRequestId）就差点这样消失；现有单测全部直调
 * service、绕过管道，所以全绿也发现不了。
 */
describe('CreateSupplementOrderDto', () => {
  const base = {
    addressId: '11111111-1111-4111-8111-111111111111',
    lines: [
      {
        ingredientId: '22222222-2222-4222-8222-222222222222',
        amount: 10,
      },
    ],
  };

  /** 复刻控制器的 whitelist 行为：没装饰器的属性会被剥离 */
  function transform(payload: Record<string, unknown>) {
    const dto = plainToInstance(CreateSupplementOrderDto, payload);
    const errors = validateSync(dto as object, { whitelist: true });
    return { dto: dto as unknown as Record<string, unknown>, errors };
  }

  it('期望金额与幂等键能穿过白名单校验', () => {
    const { dto, errors } = transform({
      ...base,
      expectedTotal: 12345,
      clientRequestId: 'abc-123',
    });

    expect(errors).toHaveLength(0);
    expect(dto.expectedTotal).toBe(12345);
    expect(dto.clientRequestId).toBe('abc-123');
  });

  it('套数上限是 99：99 通过、100 被拒', () => {
    expect(transform({ ...base, portionMultiplier: 99 }).errors).toHaveLength(0);
    expect(
      transform({ ...base, portionMultiplier: 100 }).errors.length,
    ).toBeGreaterThan(0);
  });

  it('幂等键超长在入参层就拒绝，不要拖到数据库报 500', () => {
    expect(
      transform({ ...base, clientRequestId: 'x'.repeat(65) }).errors.length,
    ).toBeGreaterThan(0);
  });

  it('期望金额必须是非负整数（分）', () => {
    expect(
      transform({ ...base, expectedTotal: -1 }).errors.length,
    ).toBeGreaterThan(0);
    expect(
      transform({ ...base, expectedTotal: 12.5 }).errors.length,
    ).toBeGreaterThan(0);
  });
});
