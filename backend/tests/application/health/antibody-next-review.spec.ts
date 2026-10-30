import { HealthService } from '../../../src/application/health/health.service';
import { buildPlanView } from '../../../src/domain/health/vaccine/engine';
import { CORE_TITER_REVIEW_YEARS } from '../../../src/domain/health/vaccine/schedule-table';

/**
 * 四块地基 #1：抗体复查日只能有一个来源（2026-10-30）。
 *
 * 背景：记录区按存下来的 3 年显示、计划区按 1 年显示，同一页两个日期。
 * 现在两边都用 `CORE_TITER_REVIEW_YEARS`（当前 1 年）；记录上存的老值不再展示。
 */

const service = Object.create(HealthService.prototype) as HealthService;

const record = (overrides: Record<string, unknown> = {}) => ({
  id: 'test-1',
  dogId: 'dog-1',
  testedAt: new Date('2026-10-01T00:00:00'),
  targets: ['CORE'],
  result: 'PASS',
  value: null,
  unit: null,
  // 模拟“旧数据”：当年按 3 年存下来的复查日
  nextReviewAt: new Date('2029-10-01T00:00:00'),
  notes: null,
  attachments: [],
  createdAt: new Date('2026-10-01T00:00:00'),
  updatedAt: new Date('2026-10-01T00:00:00'),
  ...overrides,
});

const map = (overrides: Record<string, unknown> = {}) =>
  (service as unknown as {
    mapAntibodyTestToDto: (r: unknown) => { nextReviewAt: string | null };
  }).mapAntibodyTestToDto(record(overrides));

describe('抗体复查日只有一个来源（#1）', () => {
  it('间隔常量是 1 年（产品口径，不是指南）', () => {
    expect(CORE_TITER_REVIEW_YEARS).toBe(1);
  });

  it('记录上存着 3 年，接口仍按 1 年返回', () => {
    const dto = map();
    expect(dto.nextReviewAt).toBe('2027-10-01');
  });

  it('不合格没有复查日', () => {
    expect(map({ result: 'FAIL' }).nextReviewAt).toBeNull();
  });

  it('未判读没有复查日', () => {
    expect(map({ result: 'UNKNOWN' }).nextReviewAt).toBeNull();
  });

  it('记录区与免疫计划是同一个日期', () => {
    const dto = map();
    const view = buildPlanView({
      dogId: 'dog-1',
      birthday: '2023-01-01',
      records: [],
      antibodyTests: [
        {
          id: 'test-1',
          testedAt: '2026-10-01',
          targets: ['CORE'],
          result: 'PASS',
        },
      ],
      today: new Date('2026-10-30T00:00:00'),
    });
    const core = view.plan.find((step) => step.kind === 'core' && step.titer);
    expect(core?.titer?.nextReviewAt).toBe(dto.nextReviewAt);
    expect(core?.titer?.nextReviewAt).toBe('2027-10-01');
  });
});
