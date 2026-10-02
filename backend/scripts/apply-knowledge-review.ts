/**
 * 把合作兽医填好的审核结论回填进代码。
 *
 * ── 干什么 ─────────────────────────────────────────────────
 *
 *   读 `export-knowledge-review-packet.ts` 导出的那份 CSV（兽医在
 *   「审核结论（请填）」列填了 通过 / 需修改 / 删除 / 拿不准），然后：
 *
 *     通过    → 写进 `knowledge-base/approvals.ts` 的审核登记表（顾客侧据此放行）
 *     需修改  → 条目保持未审核；意见汇总打印出来，由我们改内容后下一轮再审
 *     删除    → 也**不自动删代码**，列入清单交人工处理（删内容是破坏性操作）
 *     拿不准  → 列入清单交人工处理
 *
 *   只有「通过」会改文件，而且只改那张登记表 —— **不改任何条目内容**。
 *
 * ── 用法 ───────────────────────────────────────────────────
 *
 *   cd backend
 *   # 先预览（默认，什么都不写）
 *   npx ts-node -r tsconfig-paths/register scripts/apply-knowledge-review.ts <csv路径> --reviewer "XX动物医院 王医生"
 *   # 确认无误再落盘
 *   npx ts-node -r tsconfig-paths/register scripts/apply-knowledge-review.ts <csv路径> --reviewer "XX动物医院 王医生" --apply
 *
 *   CSV 路径缺省取 docs/knowledge-base/review-packet/ 里最新的一份。
 *
 * ── 为什么"删除/需修改"不自动执行 ───────────────────────────
 *
 *   审核结论是**人的判断**，但"怎么改"是我们的活：
 *   改错了比不改更糟（顾客看到的是改过的医学结论）。
 *   所以脚本只做机械、可逆、留痕的那一半：把"通过"的记进登记表。
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const OUT_FILE = resolve(
  __dirname,
  '../src/domain/recipe-designer/knowledge-base/approvals.ts',
);

const PACKET_DIR = resolve(
  __dirname,
  '../../docs/knowledge-base/review-packet',
);

type Conclusion = '通过' | '需修改' | '删除' | '拿不准' | '';

interface Row {
  id: string;
  title: string;
  conclusion: Conclusion;
  note: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  // 两种写法都认：--reviewer=名字 与 --reviewer "名字"
  // （文档里写的是空格写法，所以必须支持，否则审核人会静默记成默认值）
  const reviewerEq = args.find((item) => item.startsWith('--reviewer='));
  const reviewerSpaceAt = args.indexOf('--reviewer');
  const reviewerFromSpace =
    reviewerSpaceAt >= 0 && args[reviewerSpaceAt + 1] && !args[reviewerSpaceAt + 1].startsWith('--')
      ? args[reviewerSpaceAt + 1]
      : '';
  const positional = args.filter(
    (item, index) =>
      !item.startsWith('--') &&
      index !== reviewerSpaceAt + 1,
  );

  let csvPath = positional[0];
  if (!csvPath) {
    const candidates = readdirSync(PACKET_DIR)
      .filter((name) => name.endsWith('.csv'))
      .sort();
    csvPath = resolve(PACKET_DIR, candidates[candidates.length - 1]);
  }

  const reviewer = reviewerEq
    ? reviewerEq.split('=').slice(1).join('=')
    : reviewerFromSpace;

  if (apply && !reviewer) {
    console.error('缺少审核人：请用 --reviewer "XX动物医院 X医生" 指明（审核记录要留痕）。');
    process.exitCode = 1;
  }

  return {
    apply,
    csvPath: resolve(csvPath),
    reviewedAt: new Date().toISOString().slice(0, 10),
    reviewer,
  };
}

/** 极简 CSV 解析：支持引号包裹、引号内换行与逗号 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function normalizeConclusion(value: string): Conclusion {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.includes('通过')) return '通过';
  if (text.includes('需修改') || text.includes('修改')) return '需修改';
  if (text.includes('删除')) return '删除';
  if (text.includes('拿不准') || text.includes('不确定')) return '拿不准';
  return '';
}

function renderApprovals(
  approved: Map<string, { note: string }>,
  meta: { reviewer: string; reviewedAt: string },
): string {
  const header = readFileSync(OUT_FILE, 'utf-8');
  const marker = 'export const KNOWLEDGE_APPROVALS';
  const head = header.slice(0, header.indexOf(marker));

  const lines: string[] = [];
  for (const [id, item] of [...approved.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const note = item.note
      ? `\n    note: ${JSON.stringify(item.note)},`
      : '';
    lines.push(
      `  ${JSON.stringify(id)}: { reviewer: ${JSON.stringify(meta.reviewer)}, reviewedAt: ${JSON.stringify(meta.reviewedAt)},${note} },`,
    );
  }

  return [
    head + marker + ': Record<string, KnowledgeApproval> = {',
    ...(lines.length > 0
      ? lines
      : ['  // 还没有任何条目通过审核（由 scripts/apply-knowledge-review.ts 生成）']),
    '};',
    '',
    '/** 这条是否已通过审核（顾客侧的唯一凭据） */',
    'export function isKnowledgeEntryApproved(id: string): boolean {',
    '  return Boolean(KNOWLEDGE_APPROVALS[id]);',
    '}',
    '',
  ].join('\n');
}

function main() {
  const { apply, csvPath, reviewer, reviewedAt } = parseArgs();
  const rows = parseCsv(readFileSync(csvPath, 'utf-8'));
  const header = rows[0] || [];
  const idIndex = header.findIndex((cell) => cell.includes('编号'));
  const titleIndex = header.findIndex((cell) => cell.includes('标题'));
  const conclusionIndex = header.findIndex((cell) => cell.includes('审核结论'));
  const noteIndex = header.findIndex((cell) => cell.includes('审核意见'));

  if (idIndex < 0 || conclusionIndex < 0) {
    console.error('CSV 里找不到「编号」或「审核结论」列，请确认用的是审核包导出的那份。');
    process.exitCode = 1;
    return;
  }

  const parsed: Row[] = rows
    .slice(1)
    .filter((row) => String(row[idIndex] || '').trim())
    .map((row) => ({
      id: String(row[idIndex]).trim(),
      title: String(row[titleIndex] || '').trim(),
      conclusion: normalizeConclusion(row[conclusionIndex]),
      note: String(row[noteIndex] || '').trim(),
    }));

  const approved = new Map<string, { note: string }>();
  const needFix: Row[] = [];
  const toDelete: Row[] = [];
  const unsure: Row[] = [];

  for (const row of parsed) {
    if (row.conclusion === '通过') approved.set(row.id, { note: row.note });
    else if (row.conclusion === '需修改') needFix.push(row);
    else if (row.conclusion === '删除') toDelete.push(row);
    else if (row.conclusion === '拿不准') unsure.push(row);
  }

  const untouched = parsed.length - approved.size - needFix.length - toDelete.length - unsure.length;

  console.log(`审核包：${csvPath}`);
  console.log(`审核人：${reviewer}    审核日期：${reviewedAt}`);
  console.log(`共 ${parsed.length} 条：通过 ${approved.size} ｜ 需修改 ${needFix.length} ｜ 删除 ${toDelete.length} ｜ 拿不准 ${unsure.length} ｜ 未填 ${untouched}`);

  const printList = (label: string, list: Row[]) => {
    if (list.length === 0) return;
    console.log(`\n【${label}】`);
    for (const row of list) {
      console.log(`  ${row.id}  ${row.title}${row.note ? `  —— ${row.note}` : ''}`);
    }
  };

  printList('需要改内容（改完仍是未审核，下轮再审）', needFix);
  printList('建议删除（不自动删，等人工确认）', toDelete);
  printList('兽医拿不准（不自动处理）', unsure);

  if (!apply) {
    console.log('\n（预览模式，没有写任何文件。确认无误加 --apply）');
    return;
  }

  writeFileSync(OUT_FILE, renderApprovals(approved, { reviewer, reviewedAt }), 'utf-8');
  console.log(`\n已写入审核登记表：${OUT_FILE}`);
  console.log(`顾客侧现在能检索到 ${approved.size} 条已审核条目。`);
}

main();
