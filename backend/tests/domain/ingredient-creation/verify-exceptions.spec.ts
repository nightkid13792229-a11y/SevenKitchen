import { sanitizeVerifyExceptions } from '../../../src/domain/ingredient-creation/verify-exceptions';

describe('sanitizeVerifyExceptions', () => {
  const now = '2026-11-21T12:00:00.000Z';

  it('没有例外时返回空数组', () => {
    expect(sanitizeVerifyExceptions(undefined, 'admin-1', now)).toEqual({
      ok: true,
      exceptions: [],
    });
    expect(sanitizeVerifyExceptions({ exceptions: [] }, 'admin-1', now)).toEqual(
      { ok: true, exceptions: [] },
    );
  });

  it('服务端盖审批人与时间，忽略浏览器带来的值', () => {
    const result = sanitizeVerifyExceptions(
      {
        exceptions: [
          {
            code: 'EDIBLE_RANGE',
            reason: '按供应商给的可食部 60% 登记',
            approvedBy: 'fake-user',
            approvedAt: '2000-01-01T00:00:00.000Z',
          },
        ],
      },
      'admin-1',
      now,
    );

    expect(result).toEqual({
      ok: true,
      exceptions: [
        {
          code: 'EDIBLE_RANGE',
          reason: '按供应商给的可食部 60% 登记',
          approvedBy: 'admin-1',
          approvedAt: now,
        },
      ],
    });
  });

  it('理由为空 → 拒绝', () => {
    const result = sanitizeVerifyExceptions(
      { exceptions: [{ code: 'EDIBLE_RANGE', reason: '   ' }] },
      'admin-1',
      now,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('理由');
    }
  });

  it('code 为空 → 拒绝', () => {
    const result = sanitizeVerifyExceptions(
      { exceptions: [{ code: '', reason: '说明' }] },
      'admin-1',
      now,
    );
    expect(result.ok).toBe(false);
  });

  it('exceptions 不是数组 → 拒绝', () => {
    const result = sanitizeVerifyExceptions(
      { exceptions: 'not-array' },
      'admin-1',
      now,
    );
    expect(result.ok).toBe(false);
  });

  it('同一条例外重存时保留原审批人与时间，不改写成最后保存的人', () => {
    const earlier = {
      code: 'EDIBLE_RANGE',
      reason: '按供应商给的可食部 60% 登记',
      approvedBy: 'alice',
      approvedAt: '2026-11-01T08:00:00.000Z',
    };
    const second = {
      code: 'NAME_SIMILAR',
      reason: '和现有「鸡心」不是一回事',
    };

    const result = sanitizeVerifyExceptions(
      { exceptions: [earlier, second] },
      'bob',
      now,
      [earlier],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exceptions[0]).toEqual(earlier);
    expect(result.exceptions[1]).toMatchObject({
      code: 'NAME_SIMILAR',
      approvedBy: 'bob',
      approvedAt: now,
    });
  });

  it('同 code 但理由改了 → 算重新登记，盖当前人与当前时间', () => {
    const earlier = {
      code: 'EDIBLE_RANGE',
      reason: '旧理由',
      approvedBy: 'alice',
      approvedAt: '2026-11-01T08:00:00.000Z',
    };

    const result = sanitizeVerifyExceptions(
      {
        exceptions: [
          { code: 'EDIBLE_RANGE', reason: '新理由：按检测报告 62%' },
        ],
      },
      'bob',
      now,
      [earlier],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exceptions[0]).toMatchObject({
      code: 'EDIBLE_RANGE',
      reason: '新理由：按检测报告 62%',
      approvedBy: 'bob',
      approvedAt: now,
    });
  });
});
