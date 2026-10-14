import { describe, expect, it } from 'vitest';
import { parseBold } from './rich-text';

/**
 * `**加粗**` 的解析（老板 2026-10-14 选定方案 B）。
 *
 * 背景：依据文案由后端下发，里面用 markdown 的 `**` 标出最关键那句
 * （"**一针核心疫苗即可**"）。小程序的 `<text>` 不认这种写法，
 * 直接插值会把星号**原样显示**给顾客 ✗ —— 老板截图里看出来的。
 */
describe('依据文案 · 加粗标记的解析（老板 2026-10-14）', () => {
  it('把 **…** 切成"加粗段 + 普通段"', () => {
    expect(parseBold('母源抗体已经消退，**一针核心疫苗即可**（不需要连打）')).toEqual([
      { text: '母源抗体已经消退，', bold: false },
      { text: '一针核心疫苗即可', bold: true },
      { text: '（不需要连打）', bold: false },
    ]);
  });

  it('没有标记时原样返回**单段**（调用方不用特判）', () => {
    expect(parseBold('普通文案')).toEqual([{ text: '普通文案', bold: false }]);
  });

  it('一句里有**多处**加粗也能全切出来', () => {
    expect(parseBold('A**B**C**D**E')).toEqual([
      { text: 'A', bold: false },
      { text: 'B', bold: true },
      { text: 'C', bold: false },
      { text: 'D', bold: true },
      { text: 'E', bold: false },
    ]);
  });

  it('开头 / 结尾就是加粗，也能正确处理', () => {
    expect(parseBold('**开头**中间')).toEqual([
      { text: '开头', bold: true },
      { text: '中间', bold: false },
    ]);
    expect(parseBold('中间**结尾**')).toEqual([
      { text: '中间', bold: false },
      { text: '结尾', bold: true },
    ]);
    expect(parseBold('**全是加粗**')).toEqual([{ text: '全是加粗', bold: true }]);
  });

  it('🔴 落单的 `**` 不许吞字（当普通文字处理）', () => {
    // 只出现一次 —— 不是成对标记，不能把后半段吃掉
    const seg = parseBold('这里有一个落单的 ** 星号');
    expect(seg.map((s) => s.text).join('')).toBe('这里有一个落单的 ** 星号');
    expect(seg.every((s) => !s.bold)).toBe(true);
  });

  it('🔴 任何输入都不许丢字（拼回去要和原文一致）', () => {
    const cases = [
      '普通',
      '**加粗**',
      'A**B**C',
      '落单 ** 星号',
      '****空标记****',
      '中**英mix**尾',
    ];
    for (const input of cases) {
      const joined = parseBold(input)
        .map((s) => (s.bold ? `**${s.text}**` : s.text))
        .join('');
      expect(joined).toBe(input);
    }
  });
});
