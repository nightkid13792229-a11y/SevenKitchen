/**
 * 数据库结论表 / 旧原文层盘点硬门禁（知识库 v3 · Task 9）。
 *
 * 背景：仓库里的 387 条结论已删除，但还要确认数据库里没有结论表残留；
 * 同时盘点 Task 10 才 drop 的旧原文层（`source_*`）与 `knowledge_citation_anchor`，
 * 让“drop 前 / drop 后”两个状态都能被脚本判定。
 *
 * 用法：
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/knowledge-v3/audit-conclusion-tables.ts
 *   npx ts-node -r tsconfig-paths/register scripts/knowledge-v3/audit-conclusion-tables.ts --after-drop
 *
 * 判定：
 *   · 默认（Task 10 drop 前）：不允许存在结论表（`knowledge_*` 中除
 *     `knowledge_citation_anchor` 之外的任何表）；`source_*` 与
 *     `knowledge_citation_anchor` 允许存在，只盘点并打印锚点行数。
 *   · `--after-drop`：`source_*` / `knowledge_citation_anchor` / 结论表都必须消失，
 *     且只剩 4 张 kb_* 表（`kb_source` / `kb_page` / `kb_block` / `kb_toc`）。
 *
 * 退出码：0 = 通过；1 = 不符合当前阶段的期望（或连不上库）。
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const EXPECTED_KB_TABLES = ['kb_block', 'kb_page', 'kb_source', 'kb_toc'] as const;
const CITATION_ANCHOR_TABLE = 'knowledge_citation_anchor';

interface TableRow {
  table_name: string;
}

function printUsage(): void {
  console.log(
    [
      '用法：npx ts-node -r tsconfig-paths/register scripts/knowledge-v3/audit-conclusion-tables.ts [--after-drop]',
      '',
      '  --after-drop  Task 10 迁移之后运行：要求旧原文层/锚点表/结论表全部不存在，',
      '                且只剩 kb_source / kb_page / kb_block / kb_toc 四张 kb_* 表。',
      '  --help, -h    只打印用法，不连库。',
    ].join('\n'),
  );
}

function isConclusionTable(tableName: string): boolean {
  // 结论层的命名都以 knowledge_ 开头；锚点表是原文层的引用锚点，
  // 归 Task 10 删除，单独处理，不算结论表。
  return tableName.startsWith('knowledge_') && tableName !== CITATION_ANCHOR_TABLE;
}

async function countRows(
  prisma: PrismaClient,
  tableName: string,
): Promise<number | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count FROM "${tableName}"`,
    );
    return rows[0]?.count ?? null;
  } catch (error) {
    console.error(`  无法统计 ${tableName} 行数：${(error as Error).message}`);
    return null;
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  const afterDrop = process.argv.includes('--after-drop');
  const prisma = new PrismaClient();

  try {
    const allTables = await prisma.$queryRaw<TableRow[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    const names = allTables.map((row) => row.table_name);

    const conclusionTables = names.filter(isConclusionTable);
    const sourceTables = names.filter((name) => name.startsWith('source_'));
    const kbTables = names.filter((name) => name.startsWith('kb_'));
    const hasCitationAnchor = names.includes(CITATION_ANCHOR_TABLE);
    // 仅名称里含 knowledge 的历史表（例如 life_stage_acknowledgement），与知识库无关。
    const unrelatedKnowledgeNames = names.filter(
      (name) => name.includes('knowledge') && !isConclusionTable(name) && name !== CITATION_ANCHOR_TABLE,
    );

    console.log(
      `[结论表盘点] public 下与知识库相关的表（模式：${afterDrop ? 'after-drop' : 'drop 前'}）：`,
    );
    console.log(
      `  kb_*：${kbTables.length > 0 ? kbTables.join(', ') : '（无）'}`,
    );
    console.log(
      `  source_*：${sourceTables.length > 0 ? sourceTables.join(', ') : '（无）'}`,
    );
    console.log(
      `  结论表（knowledge_* 除锚点）：${conclusionTables.length > 0 ? conclusionTables.join(', ') : '（无）'}`,
    );
    if (unrelatedKnowledgeNames.length > 0) {
      console.log(
        `  名称含 knowledge 但与知识库无关：${unrelatedKnowledgeNames.join(', ')}`,
      );
    }

    if (hasCitationAnchor) {
      const rowCount = await countRows(prisma, CITATION_ANCHOR_TABLE);
      console.log(
        `  ${CITATION_ANCHOR_TABLE}：存在，行数=${rowCount ?? '未知'}（Task 10 drop 前允许）`,
      );
    } else {
      console.log(`  ${CITATION_ANCHOR_TABLE}：不存在`);
    }

    const failures: string[] = [];

    if (conclusionTables.length > 0) {
      failures.push(`存在结论表：${conclusionTables.join(', ')}`);
    }

    if (afterDrop) {
      if (sourceTables.length > 0) {
        failures.push(`旧原文层未删除：${sourceTables.join(', ')}`);
      }
      if (hasCitationAnchor) {
        failures.push(`${CITATION_ANCHOR_TABLE} 未删除`);
      }
      const expected = [...EXPECTED_KB_TABLES].sort();
      const actual = [...kbTables].sort();
      if (expected.join(',') !== actual.join(',')) {
        failures.push(
          `kb_* 表不符合预期：期望 ${expected.join(', ')}，实际 ${actual.join(', ') || '（无）'}`,
        );
      }
    }

    if (failures.length > 0) {
      console.error('✗ 结论层/旧原文层盘点未通过：');
      for (const failure of failures) {
        console.error(`  - ${failure}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log(
      afterDrop
        ? '✓ after-drop 盘点通过：旧原文层/锚点表/结论表均已删除，只剩 4 张 kb_* 表。'
        : '✓ drop 前盘点通过：没有结论表；source_* 与锚点表留待 Task 10 删除。',
    );
  } catch (error) {
    console.error(`✗ 数据库盘点失败：${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
