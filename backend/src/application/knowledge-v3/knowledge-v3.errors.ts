/**
 * 知识库 v3 工具错误（设计 §6.1）。
 *
 * `code` 是调用方判断失败原因的唯一依据；`message` 只给人看。
 * 工具边界统一包成 `KnowledgeToolResult` 的 `{ ok: false, error }`。
 */

export type KnowledgeToolErrorCode =
  | 'INVALID_ARGUMENT'
  | 'INVALID_CURSOR'
  | 'SOURCE_NOT_FOUND'
  | 'PAGE_OUT_OF_RANGE'
  | 'TOC_NOT_FOUND'
  | 'IMAGE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class KnowledgeToolError extends Error {
  constructor(
    public readonly code: KnowledgeToolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'KnowledgeToolError';
  }
}
