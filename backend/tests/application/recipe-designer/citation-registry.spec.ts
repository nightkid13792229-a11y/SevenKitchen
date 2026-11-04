import { CitationRegistry } from '../../../src/application/recipe-designer/agent/citation-registry';
import { extractCitedClaims } from '../../../src/application/recipe-designer/agent/citation-judge';

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

  it('会话恢复后 K 号继续有效', () => {
    const first = new CitationRegistry();
    const record = first.register(passage('p1'));
    const second = new CitationRegistry();
    second.restore(record);
    expect(second.audit('数值 1 [K1]').validCitationCount).toBe(1);
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

  it('只抽取带 [K#] 的句子', () => {
    const claims = extractCitedClaims(
      '犬磷 0.2–0.5% DM [K1]。\n蛋白 14–20% DM。\n血磷 5.2 mg/dL [K2][K3]。',
    );
    expect(claims).toHaveLength(2);
    expect(claims[0].citationIds).toEqual(['K1']);
    expect(claims[1].citationIds).toEqual(['K2', 'K3']);
  });
});
