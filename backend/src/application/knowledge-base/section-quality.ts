/**
 * 节可用性判定（全库计划 Task 9）。
 *
 * 全库 6,090 节里有大量"不是主题"的节：`(文档开头)`、`RESULTS`、目录行
 * （`2.2.1.1.3 犬腹腔镜子宫切除术.........`）、纯页码/图表编号。
 * 这些节被检索命中只会制造噪声，也会把"节标题查自己"的可达率拉到 15%。
 *
 * 这里只做保守过滤：明显不是主题的才剔除，拿不准的一律保留。
 */
const BOILERPLATE_TITLES = new Set([
  '(文档开头)',
  'results',
  'result',
  'references',
  'reference',
  'bibliography',
  'appendix',
  'contents',
  'table of contents',
  'introduction',
  'summary',
  'abstract',
]);

const TABLE_OR_FIGURE = /^(table|figure|fig\.?)\s*\d+(?:[-–—]\d+)?[a-z]?$/i;
const TOC_DOTS = /[.·]{5,}/;
const PAGE_NUMBER_ONLY = /^[\d\s\-–—.]+$/;

export function isUsableSection(section: {
  title?: string | null;
} | null | undefined): boolean {
  const title = String(section?.title ?? '').trim();
  if (title.length < 4) return false;
  if (BOILERPLATE_TITLES.has(title.toLowerCase())) return false;
  if (TABLE_OR_FIGURE.test(title)) return false;
  if (TOC_DOTS.test(title)) return false;
  if (PAGE_NUMBER_ONLY.test(title)) return false;
  return true;
}
