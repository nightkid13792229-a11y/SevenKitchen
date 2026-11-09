import type { LibraryPassage } from '../../knowledge-base/knowledge-library.service';
import type { TableView } from '../../knowledge-base/source-layer.service';

/** 引用对象类型：段落或表格（spec v1.1 §6.6）。 */
export type CitationKind = 'passage' | 'table';

export interface CitationRecord {
  citationId: string;
  /** 去重键：段落 = passage.id，表格 = tableId。 */
  recordId: string;
  kind: CitationKind;
  /** 表格 id（kind=table 时有值）。 */
  tableId?: string;
  /** 所属节；表格没有 section_id，固定为 null。 */
  sectionId: string | null;
  /**
   * 兼容旧字段：段落填 passage.id；表格填 tableId。
   * 旧会话记录可能只有 passageId，没有 recordId/kind。
   */
  passageId?: string;
  sourceId: string | null;
  sourceName: string | null;
  documentTitle: string | null;
  sectionTitle: string;
  pageStart: number | null;
  /** 原文（裁判只看这一段/这张表）。 */
  text: string;
}

export interface CitationAudit {
  hasCitation: boolean;
  citationCount: number;
  validCitationCount: number;
  invalidCitationCount: number;
  citedIds: string[];
  invalidIds: string[];
  numericLineCount: number;
  uncitedNumericLineCount: number;
}

/** 表格引用文本上限（spec §6.6）：表题 + 行文本，截到 1,500 字。 */
const MAX_TABLE_TEXT_CHARS = 1500;

/** 表格引用原文：表题 + 行文本（供裁判判断，不展开列结构）。 */
export function formatTableCitationText(
  table: Pick<TableView, 'caption' | 'rows'>,
): string {
  const caption = String(table.caption ?? '');
  const rows = JSON.stringify(table.rows ?? []);
  return `${caption}\n${rows}`.slice(0, MAX_TABLE_TEXT_CHARS);
}

/**
 * 一次 Agent 运行内的引用登记表。
 *
 * 工具把原文段落/表格登记成 K1/K2…；最终答案用 [K1] 引用。
 * 同一个段落/同一张表在多次检索里出现时复用同一个编号，避免模型看到两个号。
 *
 * 阶段 1 只观察：记录有效/无效引用，不阻断回答。
 */
export class CitationRegistry {
  private readonly byRecordId = new Map<string, CitationRecord>();
  private readonly byCitationId = new Map<string, CitationRecord>();
  private sequence = 0;

  register(passage: LibraryPassage): CitationRecord {
    const existing = this.byRecordId.get(passage.id);
    if (existing) return existing;
    const record: CitationRecord = {
      citationId: `K${++this.sequence}`,
      recordId: passage.id,
      kind: 'passage',
      sectionId: passage.sectionId ?? null,
      passageId: passage.id,
      sourceId: passage.sourceId ?? null,
      sourceName: passage.sourceName ?? null,
      documentTitle: passage.documentTitle ?? null,
      sectionTitle: passage.sectionTitle ?? '',
      pageStart: passage.pageStart ?? null,
      text: passage.text ?? '',
    };
    this.byRecordId.set(record.recordId, record);
    this.byCitationId.set(record.citationId, record);
    return record;
  }

  registerTable(table: TableView): CitationRecord {
    const existing = this.byRecordId.get(table.tableId);
    if (existing) return existing;
    const record: CitationRecord = {
      citationId: `K${++this.sequence}`,
      recordId: table.tableId,
      kind: 'table',
      tableId: table.tableId,
      // source_table 没有 section_id（spec §7.5），表格是文档级。
      sectionId: null,
      passageId: table.tableId,
      sourceId: table.sourceId ?? null,
      sourceName: table.sourceName ?? null,
      documentTitle: table.documentTitle ?? null,
      sectionTitle: table.caption ?? '',
      pageStart: table.pageNo ?? null,
      text: formatTableCitationText(table),
    };
    this.byRecordId.set(record.recordId, record);
    this.byCitationId.set(record.citationId, record);
    return record;
  }

  records(): CitationRecord[] {
    return [...this.byCitationId.values()];
  }

  get(citationId: string): CitationRecord | undefined {
    return this.byCitationId.get(citationId);
  }

  /**
   * 从历史会话的工具结果恢复登记；K 号保持不变。
   *
   * 兼容没有 `recordId` 的旧记录：用 `passageId`/`tableId` 兜底，
   * 没有 `kind` 时能看出是表格就按表格算，否则按段落算。
   */
  restore(record: Partial<CitationRecord> & { citationId: string }): void {
    if (!record?.citationId) return;
    const recordId = String(
      record.recordId || record.passageId || record.tableId || '',
    ).trim();
    if (!recordId) return;
    const kind: CitationKind =
      record.kind ?? (record.tableId ? 'table' : 'passage');
    const normalized: CitationRecord = {
      citationId: record.citationId,
      recordId,
      kind,
      sectionId: record.sectionId ?? null,
      passageId: record.passageId || recordId,
      sourceId: record.sourceId ?? null,
      sourceName: record.sourceName ?? null,
      documentTitle: record.documentTitle ?? null,
      sectionTitle: record.sectionTitle ?? '',
      pageStart: record.pageStart ?? null,
      text: record.text ?? '',
      ...(kind === 'table' ? { tableId: record.tableId || recordId } : {}),
    };
    this.byRecordId.set(recordId, normalized);
    this.byCitationId.set(normalized.citationId, normalized);
    const sequence = Number(normalized.citationId.replace(/^K/, ''));
    if (Number.isFinite(sequence)) {
      this.sequence = Math.max(this.sequence, sequence);
    }
  }

  audit(answer: string): CitationAudit {
    const citedIds = [
      ...new Set(
        [...String(answer ?? '').matchAll(/\[(K\d+)\]/g)].map(
          (match) => match[1],
        ),
      ),
    ];
    const validIds = citedIds.filter((id) => this.byCitationId.has(id));
    const invalidIds = citedIds.filter((id) => !this.byCitationId.has(id));
    const numericLines = String(answer ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && /\d/.test(line));
    const uncitedNumericLines = numericLines.filter(
      (line) => !/\[K\d+\]/.test(line),
    );

    return {
      hasCitation: citedIds.length > 0,
      citationCount: citedIds.length,
      validCitationCount: validIds.length,
      invalidCitationCount: invalidIds.length,
      citedIds,
      invalidIds,
      numericLineCount: numericLines.length,
      uncitedNumericLineCount: uncitedNumericLines.length,
    };
  }
}
