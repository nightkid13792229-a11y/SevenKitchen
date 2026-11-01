import { describe, expect, it } from 'vitest';
import { buildChannelChoices } from './procurement-sku-channel';

describe('buildChannelChoices', () => {
  it('优先用历史渠道（员工以前真买过的），最多 6 个', () => {
    const result = buildChannelChoices(
      ['山姆', '盒马', '永辉', '大润发', 'Costco', '叮咚买菜', '美团买菜'],
      ['山姆', '沃尔玛'],
    );

    expect(result.slice(0, 6)).toEqual([
      '山姆',
      '盒马',
      '永辉',
      '大润发',
      'Costco',
      '叮咚买菜',
    ]);
  });

  it('历史渠道不足时用默认三家补齐', () => {
    const result = buildChannelChoices(['永辉'], ['山姆', '沃尔玛', '盒马']);

    expect(result).toEqual(['永辉', '山姆', '沃尔玛', '盒马']);
  });

  it('历史渠道为空时用默认三家', () => {
    expect(buildChannelChoices([], ['山姆', '沃尔玛', '盒马'])).toEqual([
      '山姆',
      '沃尔玛',
      '盒马',
    ]);
  });

  it('去重、去掉空白项，且不把重复的塞两遍', () => {
    expect(
      buildChannelChoices([' 山姆 ', '山姆', '', '  '], ['山姆', '沃尔玛']),
    ).toEqual(['山姆', '沃尔玛']);
  });
});
