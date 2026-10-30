import { BadRequestException } from '@nestjs/common';
import { HealthService } from '../../../src/application/health/health.service';
import { buildPlanView } from '../../../src/domain/health/vaccine/engine';
import {
  classifyRecordKinds,
  classifyVaccineKinds,
  inferSingleAntigenComponents,
} from '../../../src/domain/health/vaccine/products';

/**
 * 四块地基 #3：**成分是唯一事实**（2026-10-30）。
 *
 * 这一组钉三件事：
 *   1. 名字不再直接判 core（细小单苗、犬四联、六联都不算）；
 *   2. 有成分就按成分；存下来的 kinds 只是缓存，读取时不认；
 *   3. 单苗记录保留、但顶不了核心；联名没成分 → 要求补勾，不猜。
 */

const service = Object.create(HealthService.prototype) as HealthService;
const resolve = (name: string) =>
  (service as unknown as {
    resolveComponents: (explicit: unknown, name: string) => string[];
  }).resolveComponents(undefined, name);
const requireKinds = (components: string[], name: string) =>
  (service as unknown as {
    requireKinds: (components: string[], name: string) => string[];
  }).requireKinds(components, name);

describe('四块地基 #3 · 成分是唯一事实', () => {
  it('单病种名字只推断一个成分；联苗不猜', () => {
    expect(inferSingleAntigenComponents('细小单苗')).toEqual(['cpv']);
    expect(inferSingleAntigenComponents('犬瘟热')).toEqual(['cdv']);
    expect(inferSingleAntigenComponents('犬腺病毒')).toEqual(['cav']);
    expect(inferSingleAntigenComponents('狂犬')).toEqual(['rabies']);
    expect(inferSingleAntigenComponents('钩端')).toEqual(['lepto']);

    expect(inferSingleAntigenComponents('犬二联')).toEqual([]);
    expect(inferSingleAntigenComponents('六联')).toEqual([]);
    expect(inferSingleAntigenComponents('猫三联')).toEqual([]);
  });

  it('名字不再直接判 core；产品库按真实成分才算', () => {
    for (const name of ['细小单苗', '犬瘟单苗', '犬二联', '犬四联', '六联']) {
      expect(classifyVaccineKinds(name)).not.toContain('core');
    }
    expect(classifyVaccineKinds('卫佳伍')).toContain('core');
    expect(classifyVaccineKinds('卫佳细')).toEqual(['other']);
  });

  it('记录读取：有成分就按成分，存下来的 kinds 不算数', () => {
    expect(
      classifyRecordKinds({
        vaccineName: '细小单苗',
        kinds: ['core'],
        components: ['cpv'],
      }),
    ).toEqual(['other']);

    expect(
      classifyRecordKinds({
        vaccineName: '某支苗',
        kinds: ['core'],
        components: ['cdv', 'cpv', 'cav'],
      }),
    ).toEqual(['core']);

    expect(
      classifyRecordKinds({
        vaccineName: '某支苗',
        kinds: ['core'],
        components: ['cdv', 'cpv'],
      }),
    ).toEqual(['core_early']);
  });

  it('组合苗里的钩端/狂犬不因“早期苗”被吞掉', () => {
    expect(
      classifyRecordKinds({
        vaccineName: '某支苗',
        components: ['cdv', 'cpv', 'lepto'],
      }),
    ).toEqual(['core_early', 'lepto']);

    // 带狂犬的二联是狂犬组合，不是 4 周龄抢跑苗（汪倍护）
    expect(
      classifyRecordKinds({
        vaccineName: '某支苗',
        components: ['cdv', 'cpv', 'rabies'],
      }),
    ).toEqual(['rabies']);
  });

  it('单苗记录不会让核心计划变成已完成', () => {
    const view = buildPlanView({
      dogId: 'dog-1',
      birthday: '2026-01-01',
      records: [
        {
          id: 'r1',
          vaccineName: '细小单苗',
          vaccinationDate: '2026-03-01',
        },
      ],
      today: new Date('2026-06-01T00:00:00'),
    });
    const core = view.plan.find((step) => step.kind === 'core');
    expect(core?.status).not.toBe('DONE');
  });

  it('服务端：单苗推断出成分后归 other，不抛', () => {
    expect(resolve('细小单苗')).toEqual(['cpv']);
    expect(requireKinds(['cpv'], '细小单苗')).toEqual(['other']);
  });

  it('服务端：联苗没成分 → 要求补勾（400）', () => {
    expect(resolve('犬六联')).toEqual([]);
    expect(() => requireKinds([], '犬六联')).toThrow(BadRequestException);
  });
});
