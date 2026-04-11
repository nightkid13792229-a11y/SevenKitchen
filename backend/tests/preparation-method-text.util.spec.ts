import {
  extractLegacyPreparationMethodIds,
  normalizePreparationMethodHistoryText,
  resolvePreparationMethodText,
  resolvePreparationMethodTokens,
} from '../src/application/recipe/preparation-method-text.util';

describe('preparation-method-text util', () => {
  const peelId = '11111111-1111-1111-1111-111111111111';
  const steamId = '22222222-2222-2222-2222-222222222222';
  const missingId = '33333333-3333-3333-3333-333333333333';
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

  it('extracts legacy ids across comma variants', () => {
    expect(extractLegacyPreparationMethodIds([`${peelId}， ${steamId}`])).toEqual([
      peelId,
      steamId,
    ]);
  });

  it('resolves legacy uuid strings into readable text in original order', () => {
    expect(
      resolvePreparationMethodText(`${steamId}, ${peelId}`, methodMap),
    ).toBe('蒸熟、去皮');
  });

  it('resolves mixed uuid and free-text input without leaking raw uuids', () => {
    expect(resolvePreparationMethodText(`${peelId}, 切丁`, methodMap)).toBe(
      '去皮、切丁',
    );
  });

  it('shows only resolved pieces when a uuid-only list is only partially resolvable in display mode', () => {
    expect(
      resolvePreparationMethodText(
        `${steamId}, ${peelId}`,
        new Map([[peelId, '去皮']]),
      ),
    ).toBe('去皮');
  });

  it('drops unresolved uuid-only input in display mode', () => {
    expect(resolvePreparationMethodText(missingId, methodMap)).toBeUndefined();
    expect(
      resolvePreparationMethodText(`${missingId}, ${steamId}`, new Map()),
    ).toBeUndefined();
    expect(resolvePreparationMethodTokens(`${missingId}, ${steamId}`, new Map())).toEqual(
      [],
    );
  });

  it('preserves unresolved uuid-only input when preserveUnresolvedLegacy is enabled', () => {
    expect(
      resolvePreparationMethodText(missingId, methodMap, {
        preserveUnresolvedLegacy: true,
      }),
    ).toBe(missingId);
    expect(
      resolvePreparationMethodText(
        `${steamId}, ${peelId}`,
        new Map([[peelId, '去皮']]),
        {
          preserveUnresolvedLegacy: true,
        },
      ),
    ).toBe(`${steamId}, ${peelId}`);
  });

  it('handles delimiter and whitespace variants in legacy text', () => {
    expect(
      resolvePreparationMethodText(` ${peelId}，\n${steamId} 、 切丁 `, methodMap),
    ).toBe('去皮、蒸熟、切丁');
  });

  it('passes through free text and tokenizes readable values', () => {
    expect(resolvePreparationMethodText('去皮、蒸熟后压泥', methodMap)).toBe(
      '去皮、蒸熟后压泥',
    );
    expect(resolvePreparationMethodTokens('去皮、蒸熟后压泥', methodMap)).toEqual(
      ['去皮', '蒸熟后压泥'],
    );
  });

  it('keeps readable pieces and free text when mixed input is only partially resolvable', () => {
    expect(resolvePreparationMethodText(`${missingId}, 切丁`, methodMap)).toBe(
      '切丁',
    );
    expect(
      resolvePreparationMethodText(`${peelId}, ${missingId}, 切丁`, methodMap),
    ).toBe('去皮、切丁');
  });

  it('normalizes history text punctuation for dedupe', () => {
    expect(normalizePreparationMethodHistoryText(' 去皮， 蒸熟 ')).toBe(
      '去皮、蒸熟',
    );
  });
});
