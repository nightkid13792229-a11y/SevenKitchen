/**
 * 仓库内 387 条结论正文清零硬门禁（知识库 v3 · Task 9）。
 *
 * 背景：387 条结论层的物理副本不能再留在仓库里。审核包已删除，
 * 其余历史审计文档**允许出现条目 ID**（例如 `renal-001`），
 * 但不允许再出现“条目 ID + 正文”的组合 —— 那等于把结论换个地方存着。
 *
 * 判定规则（同时命中才算违规）：
 *   1. 文件里出现条目 ID（形如 `renal-001` / `immune-002`）；
 *   2. 并且出现以下任一“结论正文”信号：
 *      · `^### <条目 ID>` 这类标题
 *      · `**结论**：` / `**要点**：` / `**注意事项**：` 正文
 *
 * 用法：
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/knowledge-v3/assert-no-conclusions.ts
 *
 * 退出码：0 = 干净；1 = 命中残留（会打印文件与行号）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';

const DOCS_DIR = path.resolve(__dirname, '../../../docs/knowledge-base');

/** 条目 ID：小写领域前缀 + 三位数字，例如 `renal-001`。 */
const ENTRY_ID_PATTERN = /\b[a-z]{2,}-[0-9]{3}\b/;

/** `### renal-001 ...` 这类以条目 ID 开头的标题。 */
const ENTRY_HEADING_PATTERN = /^\s{0,3}#{1,6}\s+[a-z]{2,}-[0-9]{3}\b/;

/** 结论正文的三个固定小标题。 */
const CONCLUSION_MARKER_PATTERN = /^\s*\*\*(结论|要点|注意事项)\*\*\s*[：:]/;

interface ViolationLine {
  line: number;
  text: string;
}

interface Violation {
  file: string;
  lines: ViolationLine[];
}

function collectMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (/\.md$/i.test(entry)) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function inspectFile(filePath: string): Violation | null {
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  const hasEntryId = lines.some((line) => ENTRY_ID_PATTERN.test(line));
  if (!hasEntryId) {
    return null;
  }

  const offending: ViolationLine[] = [];
  lines.forEach((text, index) => {
    if (ENTRY_HEADING_PATTERN.test(text) || CONCLUSION_MARKER_PATTERN.test(text)) {
      offending.push({ line: index + 1, text: text.trim().slice(0, 160) });
    }
  });

  if (offending.length === 0) {
    return null;
  }

  return {
    file: path.relative(path.resolve(__dirname, '../../..'), filePath),
    lines: offending,
  };
}

function main(): void {
  if (!existsSync(DOCS_DIR) || !statSync(DOCS_DIR).isDirectory()) {
    console.error(`✗ 找不到知识库文档目录：${DOCS_DIR}`);
    process.exit(1);
  }

  const files = collectMarkdownFiles(DOCS_DIR);
  const violations = files
    .map((file) => inspectFile(file))
    .filter((item): item is Violation => item !== null);

  if (violations.length > 0) {
    console.error(
      `✗ 发现 ${violations.length} 份文档仍含“条目 ID + 结论正文”，共扫描 ${files.length} 份：`,
    );
    for (const violation of violations) {
      console.error(`  ${violation.file}`);
      for (const line of violation.lines) {
        console.error(`    第 ${line.line} 行：${line.text}`);
      }
    }
    process.exit(1);
  }

  console.log(
    `✓ 仓库内无“条目 ID + 结论正文”残留（扫描 ${files.length} 份 Markdown）。`,
  );
}

main();
