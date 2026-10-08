/**
 * 两个"读文档"的库没有自带类型声明（2026-10-08 加）。
 *
 * 我们只用它们最核心的一个函数，所以这里按实际用法声明最小的类型，
 * 而不是引一整个 @types 包（那两个包也不存在）。
 */
declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string;
    numpages?: number;
    info?: Record<string, unknown>;
  }
  function pdfParse(data: Buffer | Uint8Array): Promise<PdfParseResult>;
  export default pdfParse;
}

declare module 'mammoth' {
  interface MammothResult {
    value: string;
    messages?: unknown[];
  }
  export function extractRawText(input: {
    buffer?: Buffer;
    path?: string;
  }): Promise<MammothResult>;
}
