import {
  countPreparationMethodContentCharacters,
  isPreparationMethodWithinContentLimit,
  truncatePreparationMethodContent,
} from 'src/domain/recipe/preparation-field-text';

describe('preparation field content length', () => {
  it('does not count slashes, punctuation or spaces', () => {
    expect(countPreparationMethodContentCharacters('牛里脊/生/去油')).toBe(6);
    expect(countPreparationMethodContentCharacters('部位 / 状态 / 预处理')).toBe(7);
  });

  it('allows exactly 10 content characters with two separators', () => {
    const text = '牛里脊/生/去皮切块丁丁';
    expect(countPreparationMethodContentCharacters(text)).toBe(10);
    expect(isPreparationMethodWithinContentLimit(text)).toBe(true);
  });

  it('rejects 11 content characters even when separators are absent', () => {
    expect(isPreparationMethodWithinContentLimit('一二三四五六七八九十一')).toBe(false);
  });

  it('truncates by content characters and keeps the separators before the cutoff', () => {
    expect(truncatePreparationMethodContent('牛里脊/生/去皮切块丁丁')).toBe(
      '牛里脊/生/去皮切块丁丁',
    );
    expect(truncatePreparationMethodContent('一二三四五六七八九十一')).toBe(
      '一二三四五六七八九十',
    );
  });
});
