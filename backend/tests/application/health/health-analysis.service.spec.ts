import {
  HEALTH_ANALYSIS_SECTIONS,
  HealthAnalysisService,
} from '../../../src/application/health/health-analysis.service';

/**
 * AI 健康分析（2026-11-11 知识库 v3）。
 *
 * 387 条结论层已删除，健康分析不再有可引用的结论来源。
 * 这里锁的不是“怎么分析”，而是“明确地不分析”：
 * 顾客侧与营养师侧都必须返回同一个不可用结果，且入口契约（七项常量）不崩。
 */
describe('HealthAnalysisService（结论层删除后）', () => {
  const service = new HealthAnalysisService();

  it('顾客侧明确不可用', async () => {
    const result = await service.analyze('customer-1', 'dog-1', 'customer');
    expect(result.available).toBe(false);
    expect(result.message).toContain('结论层已下线');
    expect(result.enableWith).toBe('HEALTH_ANALYSIS_V3');
  });

  it('营养师侧同样不可用（没有结论来源）', async () => {
    const result = await service.analyzeForStaff('dog-1');
    expect(result.available).toBe(false);
    expect(result.message).toContain('结论层已下线');
  });

  it('七项常量保留，前端契约不崩', () => {
    expect(HEALTH_ANALYSIS_SECTIONS).toHaveLength(7);
  });
});
