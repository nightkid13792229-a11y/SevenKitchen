import { CitationRegistry } from '../../../src/application/recipe-designer/agent/citation-registry';

function passage(id: string) {
  return {
    id,
    text: 'Phosphorus 0.2 to 0.5% in foods for dogs.',
    truncated: false,
    sourceId: 'SACN5',
    sourceName: '小动物临床营养学（第5版）',
    documentId: 'sacn5-chapters-SACN5-37',
    documentTitle: 'SACN5_37.pdf',
    sectionId: 'sacn5-chapters-SACN5-37-s014',
    sectionTitle: '787 Chronic Kidney Disease',
    pageStart: 17,
    score: 10,
  } as any;
}

describe('CitationRegistry', () => {
  it('同一段复用同一个编号，不同段递增', () => {
    const registry = new CitationRegistry();
    expect(registry.register(passage('p1')).citationId).toBe('K1');
    expect(registry.register(passage('p1')).citationId).toBe('K1');
    expect(registry.register(passage('p2')).citationId).toBe('K2');
  });

  it('审计有效/无效引用和未引用数值行', () => {
    const registry = new CitationRegistry();
    registry.register(passage('p1'));
    const audit = registry.audit(
      '犬磷 0.2–0.5% DM [K1]\n蛋白 14–20% DM\n未引用数值 5.2',
    );
    expect(audit.hasCitation).toBe(true);
    expect(audit.citationCount).toBe(1);
    expect(audit.validCitationCount).toBe(1);
    expect(audit.invalidCitationCount).toBe(0);
    expect(audit.numericLineCount).toBe(3);
    expect(audit.uncitedNumericLineCount).toBe(2);
    expect(registry.audit('数值 1 [K9]').invalidIds).toEqual(['K9']);
  });
});
