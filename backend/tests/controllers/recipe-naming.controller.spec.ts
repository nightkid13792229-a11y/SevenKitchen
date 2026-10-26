import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 路由契约：直接读源码文本，不 import 控制器。
 * 控制器依赖太重（几十个 service），import 会因循环依赖直接报错。
 */
const source = readFileSync(
  join(__dirname, '../../src/interfaces/controllers/admin.controller.ts'),
  'utf8',
);

describe('AI 命名接口契约', () => {
  it('可用性检查路由存在', () => {
    expect(source).toContain("@Get('recipe-designer/naming/availability')");
  });

  it('候选生成路由存在，且挂在系列下', () => {
    expect(source).toContain(
      "@Post('recipe-designer/series/:seriesId/name-candidates')",
    );
  });

  it('生成接口只生成不落库：没有写名字的调用', () => {
    const handler = source.slice(
      source.indexOf('generateSeriesNameCandidates'),
      source.indexOf('generateSeriesNameCandidates') + 600,
    );
    expect(handler).toContain('generateSeriesNameCandidates(seriesId)');
    expect(handler).not.toContain('updateSeries');
  });
});
