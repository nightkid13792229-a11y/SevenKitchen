import { CitationRegistry } from '../../../src/application/recipe-designer/agent/citation-registry';
import type { TableView } from '../../../src/application/knowledge-base/source-layer.service';
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

function tableFixture(overrides: Partial<TableView> = {}): TableView {
  return {
    tableId: 'T0497',
    caption: 'Table 37-9. Key nutritional factors for dogs with CKD',
    pageNo: 812,
    columns: ['Nutrient', 'Target'],
    rows: [['Phosphorus', '0.2–0.5% DM']],
    rowCount: 1,
    documentId: 'sacn5-chapters-SACN5-37',
    documentTitle: 'SACN5_37.pdf',
    sourceId: 'SACN5',
    sourceName: '小动物临床营养学（第5版）',
    ...overrides,
  };
}

describe('CitationRegistry', () => {
  it('段落登记带 recordId/kind/sectionId', () => {
    const registry = new CitationRegistry();
    const record = registry.register(passage('p1'));
    expect(record.citationId).toBe('K1');
    expect(record.recordId).toBe('p1');
    expect(record.kind).toBe('passage');
    expect(record.sectionId).toBe('sacn5-chapters-SACN5-37-s014');
    expect(record.passageId).toBe('p1');
  });

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

  it('表格也登记 K 号并参与审计', () => {
    const registry = new CitationRegistry();
    const record = registry.registerTable(tableFixture());
    expect(record.kind).toBe('table');
    expect(record.recordId).toBe('T0497');
    expect(record.tableId).toBe('T0497');
    expect(record.sectionId).toBeNull();
    expect(record.text).toContain('Table 37-9');
    expect(record.text).toContain('0.2–0.5% DM');
    expect(registry.audit('磷 0.2–0.5% DM [K1]').validCitationCount).toBe(1);
  });

  it('同一张表复用同一个 K 号', () => {
    const registry = new CitationRegistry();
    expect(registry.registerTable(tableFixture()).citationId).toBe('K1');
    expect(registry.registerTable(tableFixture()).citationId).toBe('K1');
  });

  it('表格 K 号会话恢复后仍有效', () => {
    const first = new CitationRegistry();
    const record = first.registerTable(tableFixture());
    const second = new CitationRegistry();
    second.restore(record);
    expect(second.audit('磷 0.2–0.5% DM [K1]').validCitationCount).toBe(1);
    expect(second.get('K1')?.kind).toBe('table');
    expect(second.get('K1')?.tableId).toBe('T0497');
  });

  it('没有 recordId 的旧记录也能恢复', () => {
    const registry = new CitationRegistry();
    registry.restore({
      citationId: 'K7',
      passageId: 'old-passage-1',
      sourceId: 'SACN5',
      sourceName: '小动物临床营养学（第5版）',
      documentTitle: 'SACN5_37.pdf',
      sectionTitle: '787 Chronic Kidney Disease',
      pageStart: 17,
      text: 'Phosphorus 0.2 to 0.5% DM.',
    } as any);
    expect(registry.audit('磷 0.2–0.5% DM [K7]').validCitationCount).toBe(1);
    expect(registry.get('K7')?.recordId).toBe('old-passage-1');
    expect(registry.get('K7')?.kind).toBe('passage');
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
