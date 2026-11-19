/**
 * 知识库取页规划：命中一堆页，要挑几页真读。
 *
 * 为什么需要它：之前是「三条查询的命中拼起来取前 4 条」，于是第一条查询
 * （往往是 `<营养素> absorption`）只要命中够多，就把名额占满，
 * 讲"氧化物""螯合物"的那两条查询根本没机会出场——铁那次四档全"证据不足"就是这么来的。
 *
 * 规则：
 * 1. **每条查询轮流取**：先各取 1 页，再回头补第 2 页；
 * 2. 同一文档最多 2 页（避免一篇占满上下文）；
 * 3. 索引/目录页不读；
 * 4. 每一页被丢都要有原因，方便复盘。
 */

export interface RetrievalHit {
  documentId: string;
  pageNo: number;
  score: number;
  snippet: string;
}

export interface RetrievalQueryHits {
  query: string;
  hits: RetrievalHit[];
}

export interface RetrievalPlanOptions {
  totalPages: number;
  perQueryMax: number;
  perDocumentMax: number;
}

export interface PlannedPage {
  documentId: string;
  pageNo: number;
  score: number;
  query: string;
}

export type DropReason =
  | 'DUPLICATE'
  | 'QUERY_LIMIT'
  | 'DOC_LIMIT'
  | 'TOTAL_LIMIT'
  | 'INDEX_PAGE'
  /** 计划读、但正文读不出来（2026-11-20 复核补：以前这种页会凭空消失） */
  | 'READ_FAILED';

export interface DroppedPage {
  documentId: string;
  pageNo: number;
  reason: DropReason;
}

/**
 * 首词就是 Index/Contents/目录/索引，且后面还有内容。
 *
 * 之所以要认这种"首词"形态：`kb_find` 返回的 snippet 是把整页空白折成空格的**单行**文本，
 * 多行判据在真实数据上永远走不到（2026-11-20 复核发现）。
 */
const INDEX_FIRST_LINE = /^(index|contents|目\s*录|索\s*引)(\s|$)/i;
/** 「1. 某某 …… 12」这种带引导点的条目标志 */
const INDEX_ENTRY = /^\s*\d+[.、]\s+\S.*[.．·]{2,}\s*\d+\s*$/;

/**
 * 目录/索引页的判据：首行就是 Index/Contents/目录，或者一大半是「编号 + 引导点 + 页码」的行。
 *
 * 为什么要判：索引页读了也没内容，白占一个上下文名额（铁那次模型自己说"片段4是索引页"）。
 */
export function looksLikeIndexPage(text: string): boolean {
  const source = String(text ?? '');
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return false;
  }
  if (INDEX_FIRST_LINE.test(lines[0])) {
    return true;
  }
  const entryLines = lines.filter((line) => INDEX_ENTRY.test(line)).length;
  return lines.length >= 5 && entryLines / lines.length > 0.5;
}

export function planRetrievalPages(
  input: RetrievalQueryHits[],
  options: RetrievalPlanOptions,
): { pages: PlannedPage[]; dropped: DroppedPage[] } {
  const pages: PlannedPage[] = [];
  const dropped: DroppedPage[] = [];
  if (input.length === 0 || options.totalPages <= 0) {
    return { pages, dropped };
  }

  // ① 先按「查询轮流」排成一条队伍，顺路去掉重复页与索引页
  const seen = new Set<string>();
  const queueByQuery: { query: string; hits: RetrievalHit[] }[] = input.map((item) => ({
    query: item.query,
    hits: [],
  }));

  const longest = Math.max(...input.map((item) => item.hits.length));
  for (let round = 0; round < longest; round += 1) {
    for (let index = 0; index < input.length; index += 1) {
      const hit = input[index].hits[round];
      if (!hit) {
        continue;
      }
      const key = `${hit.documentId}#${hit.pageNo}`;
      // 先判索引页再判重复：同一页被两条查询命中时，原因是"索引页"，不是"重复"
      if (looksLikeIndexPage(hit.snippet)) {
        if (!seen.has(key)) {
          dropped.push({
            documentId: hit.documentId,
            pageNo: hit.pageNo,
            reason: 'INDEX_PAGE',
          });
          seen.add(key);
        }
        continue;
      }
      if (seen.has(key)) {
        dropped.push({
          documentId: hit.documentId,
          pageNo: hit.pageNo,
          reason: 'DUPLICATE',
        });
        continue;
      }
      seen.add(key);
      queueByQuery[index].hits.push(hit);
    }
  }

  // ② 按同一个轮流顺序取页，边取边记配额
  const perQuery = new Map<string, number>();
  const perDocument = new Map<string, number>();

  for (let round = 0; round < longest; round += 1) {
    for (let index = 0; index < queueByQuery.length; index += 1) {
      const entry = queueByQuery[index];
      const hit = entry.hits[round];
      if (!hit) {
        continue;
      }

      if (pages.length >= options.totalPages) {
        dropped.push({
          documentId: hit.documentId,
          pageNo: hit.pageNo,
          reason: 'TOTAL_LIMIT',
        });
        continue;
      }
      const usedByQuery = perQuery.get(entry.query) ?? 0;
      if (usedByQuery >= options.perQueryMax) {
        dropped.push({
          documentId: hit.documentId,
          pageNo: hit.pageNo,
          reason: 'QUERY_LIMIT',
        });
        continue;
      }
      const usedByDocument = perDocument.get(hit.documentId) ?? 0;
      // 每条查询的第 1 页不受文档上限限制：否则四条查询都命中同一本书时，
      // 后面的查询一页都读不到（2026-11-20 复核发现的"饿死"问题）
      if (usedByQuery > 0 && usedByDocument >= options.perDocumentMax) {
        dropped.push({
          documentId: hit.documentId,
          pageNo: hit.pageNo,
          reason: 'DOC_LIMIT',
        });
        continue;
      }

      pages.push({
        documentId: hit.documentId,
        pageNo: hit.pageNo,
        score: hit.score,
        query: entry.query,
      });
      perQuery.set(entry.query, usedByQuery + 1);
      perDocument.set(hit.documentId, usedByDocument + 1);
    }
  }

  return { pages, dropped };
}
