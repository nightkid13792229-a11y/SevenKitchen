/**
 * 知识库检索用量报告（2026-11-09 最小图书馆版 Task 6）。
 *
 * 数据源：`recipe_design_agent_message`（Agent 每条工具调用落一行）。
 * 口径：`tool_name in ('search_knowledge_library', 'open_knowledge', 'knowledge_scope')`。
 *
 * 用法：
 * - `npm run kb:usage`                      → Markdown 打到 stdout
 * - `npm run kb:usage -- --out <file.md>`   → 同时写文件（默认不写，避免评估产物散落）
 *
 * 「0 结果」定义：
 * - `search_knowledge_library`：`tool_result.data.status === 'no_match'`（0 节 0 表）；
 * - `open_knowledge`：`tool_result.ok === false`（打不开，模型拿不到全文）；
 * - `knowledge_scope`：不计 0 结果（它是馆藏总览，返回空也代表「库是空的」）。
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { isEvalCreatedBy } from '../../src/application/knowledge-base/eval-identity';

const TOOL_NAMES = [
  'search_knowledge_library',
  'open_knowledge',
  'knowledge_scope',
] as const;

const RECENT_DAYS = 7;
const TOP_QUERY_LIMIT = 10;
/** 单条查询展示上限，避免超长中文查询把表格撑爆。 */
const MAX_QUERY_CHARS = 90;

type ToolName = (typeof TOOL_NAMES)[number];

interface MessageRow {
  toolName: string | null;
  toolArgs: unknown;
  toolResult: unknown;
  createdAt: Date;
  session?: { createdBy: string } | null;
}

interface ToolStats {
  calls: number;
  zeroResult: number;
  recentCalls: number;
  recentZeroResult: number;
}

function parseArgs(argv: string[]): { out?: string; includeEval: boolean } {
  const includeEval = argv.includes('--include-eval');
  const index = argv.findIndex((item) => item === '--out');
  if (index >= 0) {
    const value = String(argv[index + 1] ?? '').trim();
    if (value) return { out: value, includeEval };
  }
  return { includeEval };
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? (value as Record<string, any>) : {};
}

function queryOf(row: MessageRow): string {
  const args = asRecord(row.toolArgs);
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  return query.length > MAX_QUERY_CHARS
    ? `${query.slice(0, MAX_QUERY_CHARS)}…`
    : query;
}

function openTargetOf(row: MessageRow): string {
  const args = asRecord(row.toolArgs);
  const target =
    (typeof args.tableId === 'string' && args.tableId.trim()) ||
    (typeof args.sectionId === 'string' && args.sectionId.trim()) ||
    (typeof args.citationId === 'string' && args.citationId.trim()) ||
    '';
  return String(target);
}

export function isZeroResult(row: MessageRow): boolean {
  // `toolResult` 落的是整个 ToolOutcome `{ ok, data, summary }`（见 recipe-agent.service）。
  const outcome = asRecord(row.toolResult);
  const data = asRecord(outcome.data);
  if (row.toolName === 'search_knowledge_library') {
    if (data.status === 'no_match') return true;
    const sections = Array.isArray(data.sections) ? data.sections : [];
    const tables = Array.isArray(data.tables) ? data.tables : [];
    // 历史消息（2026-11-08 之前）存的是 `{count, passages}`，没有 status/sections；
    // 不能把"没这两个字段"当成 0 结果，否则整周报表会显示 100% 零结果。
    const passages = Array.isArray(data.passages) ? data.passages : [];
    if (sections.length > 0 || tables.length > 0 || passages.length > 0) {
      return false;
    }
    const count = typeof data.count === 'number' ? data.count : undefined;
    if (count !== undefined) return count === 0;
    return false;
  }
  if (row.toolName === 'open_knowledge') {
    return outcome.ok === false;
  }
  return false;
}

function dayKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function percent(part: number, total: number): string {
  if (total <= 0) return '—';
  return `${Math.round((part / total) * 1000) / 10}%`;
}

function topEntries(map: Map<string, number>, limit: number): Array<[string, number]> {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function shortDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 纯聚合：把消息行汇总成 Markdown + 一行摘要。
 *
 * 导出是为了能拿固定样本核对口径（脚本本身只做「取数 → 聚合 → 打印」）。
 */
export function summarizeMessages(
  rows: MessageRow[],
  startedAt: Date = new Date(),
): { markdown: string; summary: string } {
  const recentStart = new Date(
    startedAt.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000,
  );

  const stats = new Map<ToolName, ToolStats>();
  for (const name of TOOL_NAMES) {
    stats.set(name, { calls: 0, zeroResult: 0, recentCalls: 0, recentZeroResult: 0 });
  }

  const queryCounts = new Map<string, number>();
  const zeroQueryCounts = new Map<string, number>();
  const openTargetCounts = new Map<string, number>();
  const perDay = new Map<string, { calls: number; zeroResult: number }>();
  for (let offset = RECENT_DAYS - 1; offset >= 0; offset -= 1) {
    const day = new Date(startedAt.getTime() - offset * 24 * 60 * 60 * 1000);
    perDay.set(dayKey(day), { calls: 0, zeroResult: 0 });
  }

  let noResultTotal = 0;
  for (const row of rows) {
    const name = String(row.toolName ?? '') as ToolName;
    const entry = stats.get(name);
    if (!entry) continue;
    const zero = isZeroResult(row);
    const recent = row.createdAt >= recentStart;
    entry.calls += 1;
    if (zero) {
      entry.zeroResult += 1;
      noResultTotal += 1;
    }
    if (recent) {
      entry.recentCalls += 1;
      if (zero) entry.recentZeroResult += 1;
      const bucket = perDay.get(dayKey(row.createdAt));
      if (bucket) {
        bucket.calls += 1;
        if (zero) bucket.zeroResult += 1;
      }
    }
    if (name === 'search_knowledge_library') {
      const query = queryOf(row);
      if (query) {
        queryCounts.set(query, (queryCounts.get(query) ?? 0) + 1);
        if (zero) zeroQueryCounts.set(query, (zeroQueryCounts.get(query) ?? 0) + 1);
      }
    }
    if (name === 'open_knowledge') {
      const target = openTargetOf(row);
      if (target) openTargetCounts.set(target, (openTargetCounts.get(target) ?? 0) + 1);
    }
  }

  const totalCalls = rows.length;
  const totalRecent = [...stats.values()].reduce(
    (sum, entry) => sum + entry.recentCalls,
    0,
  );
  const recentZero = [...stats.values()].reduce(
    (sum, entry) => sum + entry.recentZeroResult,
    0,
  );

  const lines: string[] = [
    '# 知识库检索用量（自动生成）',
    '',
    `> 生成时间：${shortDate(startedAt)}　|　数据源：\`recipe_design_agent_message\`　|　脚本：\`backend/scripts/knowledge-base/knowledge-usage-report.ts\``,
    `> 口径：\`tool_name in (${TOOL_NAMES.map((name) => `'${name}'`).join(', ')})\`；0 结果定义见脚本头注释。`,
    '',
    '## 总览',
    '',
    '| 工具 | 调用数 | 0 结果 | 0 结果占比 |',
    '|---|---|---|---|',
    ...TOOL_NAMES.map((name) => {
      const entry = stats.get(name)!;
      return `| \`${name}\` | ${entry.calls} | ${entry.zeroResult} | ${percent(entry.zeroResult, entry.calls)} |`;
    }),
    `| **合计** | ${totalCalls} | ${noResultTotal} | ${percent(noResultTotal, totalCalls)} |`,
    '',
    `## 最近 ${RECENT_DAYS} 天`,
    '',
    `- 调用 ${totalRecent} 次，其中 0 结果 ${recentZero} 次（${percent(recentZero, totalRecent)}）`,
    '',
    '| 日期 | 调用数 | 0 结果 |',
    '|---|---|---|',
    ...[...perDay.entries()].map(
      ([day, bucket]) => `| ${day} | ${bucket.calls} | ${bucket.zeroResult} |`,
    ),
    '',
    `## Top 查询（前 ${TOP_QUERY_LIMIT}，按 \`search_knowledge_library\` 的 query 归一）`,
    '',
  ];

  const topQueries = topEntries(queryCounts, TOP_QUERY_LIMIT);
  if (topQueries.length === 0) {
    lines.push('暂无记录。', '');
  } else {
    lines.push('| 查询 | 次数 | 0 结果 |', '|---|---|---|');
    for (const [query, count] of topQueries) {
      lines.push(
        `| ${query.replace(/\|/g, '\\|')} | ${count} | ${zeroQueryCounts.get(query) ?? 0} |`,
      );
    }
    lines.push('');
  }

  lines.push(
    `## Top 打开对象（前 ${TOP_QUERY_LIMIT}，\`open_knowledge\` 的 tableId/sectionId/citationId）`,
    '',
  );
  const topTargets = topEntries(openTargetCounts, TOP_QUERY_LIMIT);
  if (topTargets.length === 0) {
    lines.push('暂无记录。', '');
  } else {
    lines.push('| 对象 | 次数 |', '|---|---|');
    for (const [target, count] of topTargets) {
      lines.push(`| ${target.replace(/\|/g, '\\|')} | ${count} |`);
    }
    lines.push('');
  }

  lines.push(
    '## 说明',
    '',
    '- 这张表只统计 Agent 真正发起的工具调用；没有会话就没有行，空表是正常状态。',
    '- 「0 结果」高通常意味着：词表缺同义词、库未覆盖，或模型把范围参数传成了空数组。',
    '',
  );

  const markdown = lines.join('\n');
  const summary = [
    `调用 ${totalCalls} 次（最近 ${RECENT_DAYS} 天 ${totalRecent} 次）`,
    `0 结果 ${noResultTotal} 次（${percent(noResultTotal, totalCalls)}）`,
    `检索 ${stats.get('search_knowledge_library')!.calls}、打开 ${stats.get('open_knowledge')!.calls}、馆藏 ${stats.get('knowledge_scope')!.calls}`,
  ].join('；');
  return { markdown, summary };
}

async function buildReport(
  prisma: PrismaClient,
  options: { includeEval?: boolean } = {},
): Promise<{ markdown: string; summary: string }> {
  const rows = (await prisma.recipeDesignAgentMessage.findMany({
    where: { toolName: { in: [...TOOL_NAMES] } },
    select: {
      toolName: true,
      toolArgs: true,
      toolResult: true,
      createdAt: true,
      session: { select: { createdBy: true } },
    },
    orderBy: { createdAt: 'desc' },
  })) as MessageRow[];
  const used = options.includeEval
    ? rows
    : rows.filter((row) => !isEvalCreatedBy(row.session?.createdBy));
  return summarizeMessages(used, new Date());
}

if (require.main === module) {
  (async () => {
    const prisma = new PrismaClient();
    try {
      const { out, includeEval } = parseArgs(process.argv.slice(2));
      const { markdown, summary } = await buildReport(prisma, { includeEval });
      if (out) {
        writeFileSync(out, markdown);
        console.log(`报告已写入：${out}`);
      } else {
        process.stdout.write(`${markdown}\n`);
      }
      console.log(summary);
      console.log(
        includeEval
          ? '口径：包含 kb-eval-* 测试会话（--include-eval）'
          : '口径：已排除 kb-eval-* 测试会话',
      );
    } finally {
      await prisma.$disconnect();
    }
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
