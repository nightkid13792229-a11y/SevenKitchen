import {
  EVAL_STAFF_ID,
  isEvalCreatedBy,
} from '../../../src/application/knowledge-base/eval-identity';
import { assertSeedAllowed } from '../../../scripts/knowledge-base/seed-eval-staff';

/**
 * 测试身份（全库计划 Task 3）。
 *
 * 背景：设计稿要求按 createdBy='kb-eval-*' 标记并排除测试流量，
 * 但 createdBy 实际存的是 User.id（uuid），永远不可能以 kb-eval- 开头。
 * 修法：测试账号用固定 id `kb-eval-staff`，createdBy 自然带上前缀。
 */

describe('isEvalCreatedBy', () => {
  it('固定测试账号', () => {
    expect(isEvalCreatedBy(EVAL_STAFF_ID)).toBe(true);
  });

  it('每次运行的测试账号', () => {
    expect(isEvalCreatedBy('kb-eval-20261110-1')).toBe(true);
  });

  it('真实用户不算', () => {
    expect(isEvalCreatedBy('3f2a7c1e-0000-4000-8000-000000000000')).toBe(false);
  });

  it('空值不算', () => {
    expect(isEvalCreatedBy(null)).toBe(false);
    expect(isEvalCreatedBy(undefined)).toBe(false);
  });
});

describe('assertSeedAllowed', () => {
  const base = {
    NODE_ENV: 'development',
    KB_EVAL_ALLOW_SEED: '1',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/sevenkitchen',
  } as NodeJS.ProcessEnv;

  it('生产环境拒绝', () => {
    expect(() => assertSeedAllowed({ ...base, NODE_ENV: 'production' })).toThrow(
      '生产',
    );
  });

  it('没有显式开关拒绝', () => {
    expect(() =>
      assertSeedAllowed({ ...base, KB_EVAL_ALLOW_SEED: '' }),
    ).toThrow('KB_EVAL_ALLOW_SEED');
  });

  it('非本地库拒绝', () => {
    expect(() =>
      assertSeedAllowed({
        ...base,
        DATABASE_URL: 'postgresql://u:p@db.example.com:5432/sevenkitchen',
      }),
    ).toThrow('本地');
  });

  it('本地 + 显式开关放行', () => {
    expect(() => assertSeedAllowed(base)).not.toThrow();
  });
});
