import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * components 必须真的写进库（2026-10-06）。
 *
 * ⚠️ 这条测试是**踩过坑之后补的**。
 *
 * 病种是顾客勾的主数据、类别由它推导 —— 但如果仓储层的 create/update
 * 字段清单里漏了它，接口看起来一切正常（返回体里的 components 会从名字
 * 兜底推出来），**库里却永远是空的**：顾客勾了 4 个病种，存下去变 6 个
 * （按名字查产品库的结果），再读出来还是 6 个。
 *
 * 这不是假设 —— 生产者实测就撞上了：传 4 个进去、回来 6 个。
 * 而且和 2026-10-06 早些时候"改分类改不动"那个 bug **是同一类**：
 * DTO 收了字段，仓储没写。
 *
 * 所以这里直接盯住仓储的字段清单。
 */
describe('疫苗记录 · components 必须写进库（2026-10-06）', () => {
  const repo = () =>
    readFileSync(
      resolve(
        process.cwd(),
        'src/infrastructure/repositories/prisma-health.repository.ts',
      ),
      'utf-8',
    );

  it('🔴 仓储的 create 与 update 都要写 components', () => {
    const source = repo();

    // 疫苗记录的 create / update 各有一处字段清单
    const occurrences = source.split('components: data.components,').length - 1;
    expect(occurrences).toBe(2);
  });

  it('读回来也要带 components（否则界面拿不到病种）', () => {
    const source = repo();

    expect(source).toContain('components: record.components ?? [],');
  });
});
