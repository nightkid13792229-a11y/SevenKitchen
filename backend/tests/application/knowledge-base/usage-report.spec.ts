import { isZeroResult } from '../../../scripts/knowledge-base/knowledge-usage-report';

/**
 * 0 结果口径：新消息看 status/sections/tables，历史消息看 count/passages。
 * 不能把"没有 sections 字段"当成 0 结果（会把整周报表打成 100%）。
 */

const row = (data: unknown) =>
  ({
    toolName: 'search_knowledge_library',
    toolArgs: {},
    toolResult: { ok: true, data },
    createdAt: new Date(),
  }) as any;

describe('isZeroResult', () => {
  it('新消息：no_match 算 0 结果', () => {
    expect(row({ status: 'no_match', sections: [], tables: [] })).toBeTruthy();
    expect(isZeroResult(row({ status: 'no_match', sections: [], tables: [] }))).toBe(true);
  });

  it('新消息：有节/表不算 0 结果', () => {
    expect(isZeroResult(row({ status: 'ok', sections: [{}], tables: [] }))).toBe(false);
  });

  it('历史消息：有 passages/count 不算 0 结果', () => {
    expect(isZeroResult(row({ count: 8, passages: [{}] }))).toBe(false);
  });

  it('历史消息：count=0 算 0 结果', () => {
    expect(isZeroResult(row({ count: 0, passages: [] }))).toBe(true);
  });

  it('形状未知不误报', () => {
    expect(isZeroResult(row({}))).toBe(false);
  });

  it('open_knowledge 失败算 0 结果', () => {
    expect(
      isZeroResult({
        toolName: 'open_knowledge',
        toolArgs: {},
        toolResult: { ok: false },
        createdAt: new Date(),
      } as any),
    ).toBe(true);
  });
});
