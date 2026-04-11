import {
  extractLegacyPreparationMethodIds,
  normalizePreparationMethodHistoryText,
  resolvePreparationMethodText,
  resolvePreparationMethodTokens,
} from '../src/application/recipe/preparation-method-text.util';

describe('preparation-method-text util', () => {
  const peelId = '11111111-1111-1111-1111-111111111111';
  const steamId = '22222222-2222-2222-2222-222222222222';
  const methodMap = new Map([
    [peelId, '去皮'],
    [steamId, '蒸熟'],
  ]);

  it('extracts unique legacy ids from mixed values', () => {
    expect(
      extractLegacyPreparationMethodIds([
        `${peelId}, ${steamId}`,
        steamId,
        '去皮、蒸熟',
        undefined,
      ]),
    ).toEqual([peelId, steamId]);
  });

  it('resolves legacy uuid strings into readable text in original order', () => {
    expect(
      resolvePreparationMethodText(`${steamId}, ${peelId}`, methodMap),
    ).toBe('蒸熟、去皮');
  });

  it('passes through free text and tokenizes readable values', () => {
    expect(resolvePreparationMethodText('去皮、蒸熟后压泥', methodMap)).toBe(
      '去皮、蒸熟后压泥',
    );
    expect(resolvePreparationMethodTokens('去皮、蒸熟后压泥', methodMap)).toEqual(
      ['去皮', '蒸熟后压泥'],
    );
  });

  it('normalizes history text punctuation for dedupe', () => {
    expect(normalizePreparationMethodHistoryText(' 去皮， 蒸熟 ')).toBe(
      '去皮、蒸熟',
    );
  });
});
