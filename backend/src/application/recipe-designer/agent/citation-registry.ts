import type { LibraryPassage } from '../../knowledge-base/knowledge-library.service';

export interface CitationRecord {
  citationId: string;
  passageId: string;
  sourceId: string | null;
  sourceName: string | null;
  documentTitle: string | null;
  sectionTitle: string;
  pageStart: number | null;
  /** 原文（裁判只看这一段） */
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

/**
 * 一次 Agent 运行内的引用登记表。
 *
 * 工具把原文段落登记成 K1/K2…；最终答案用 [K1] 引用。
 * 同一段在多次检索里出现时复用同一个编号，避免模型看到两个号。
 *
 * 阶段 1 只观察：记录有效/无效引用，不阻断回答。
 */
export class CitationRegistry {
  private readonly byPassageId = new Map<string, CitationRecord>();
  private readonly byCitationId = new Map<string, CitationRecord>();
  private sequence = 0;

  register(passage: LibraryPassage): CitationRecord {
    const existing = this.byPassageId.get(passage.id);
    if (existing) return existing;
    const record: CitationRecord = {
      citationId: `K${++this.sequence}`,
      passageId: passage.id,
      sourceId: passage.sourceId ?? null,
      sourceName: passage.sourceName ?? null,
      documentTitle: passage.documentTitle ?? null,
      sectionTitle: passage.sectionTitle ?? '',
      pageStart: passage.pageStart ?? null,
      text: passage.text ?? '',
    };
    this.byPassageId.set(passage.id, record);
    this.byCitationId.set(record.citationId, record);
    return record;
  }

  records(): CitationRecord[] {
    return [...this.byCitationId.values()];
  }

  get(citationId: string): CitationRecord | undefined {
    return this.byCitationId.get(citationId);
  }

  /** 从历史会话的工具结果恢复登记；K 号保持不变。 */
  restore(record: CitationRecord): void {
    if (!record?.citationId || !record?.passageId) return;
    this.byPassageId.set(record.passageId, record);
    this.byCitationId.set(record.citationId, record);
    const sequence = Number(record.citationId.replace(/^K/, ''));
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
