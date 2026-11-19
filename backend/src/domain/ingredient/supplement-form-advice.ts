/**
 * 形态建议用到的公共类型。
 *
 * 2026-11-20 起「固定四档」已删除：形态与来源的取值由知识库原文和市场标题长出来，
 * 这里只留两样东西——引用，以及"这次读了哪几页"的检索明细。
 */
import type { DropReason } from './kb-retrieval-plan';

export interface Citation {
  documentId: string;
  documentName: string;
  page: number;
  quote: string;
}

/** 这次读了哪几页、丢了哪些页：复盘用（铁那次就是因为没有页码查不清） */
export interface RetrievalSummary {
  queries: string[];
  pages: { documentId: string; page: number; score: number }[];
  dropped: { documentId: string; page: number; reason: DropReason }[];
  /** 检索本身失败的查询（DB 故障/超时），与"没命中"分开报 */
  failures?: { query: string; error: string }[];
}
