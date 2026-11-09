/**
 * 5 场景引用冒烟（spec v1.1 §8「引用有效率 100%」/ Task 7）。
 *
 * 每个场景走 Agent 工具层，和 `evaluate-library.ts` 用同一条路径：
 *   `search_knowledge_library` → 取 top 节第一段的 `citationId`
 *   → `open_knowledge({ citationId })` → 断言打开的节里仍有该段、K 号不变
 *   → `CitationRegistry.audit('磷 0.2–0.5% DM [K#]')` 验证引用有效。
 *
 * 第 5 个场景是负样本：`CKD dog vitamin K target` 必须 `no_match`（0 节 0 表）。
 *
 * 用法（需要 `.env` 里的 DATABASE_URL）：
 * - `npm run kb:smoke`               → 跑 5 场景并写入 `citation-smoke.md`
 * - `npm run kb:smoke -- --no-write` → 只打印，不覆盖报告
 * - `npm run kb:smoke -- --out <p>`  → 写到指定路径
 *
 * 退出码：任一场景不通过 → 1。
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { KnowledgeLibraryService } from '../../src/application/knowledge-base/knowledge-library.service';
import { SourceLayerService } from '../../src/application/knowledge-base/source-layer.service';
import { CitationRegistry } from '../../src/application/recipe-designer/agent/citation-registry';
import {
  executeTool,
  type ToolExecutionContext,
} from '../../src/application/recipe-designer/agent/tools';

const REPO_ROOT = resolve(__dirname, '../../..');
const DEFAULT_OUT = resolve(
  REPO_ROOT,
  'docs/knowledge-base/ckd-structure/citation-smoke.md',
);

/** 引用冒烟用的 5 个场景（spec v1.1 §8 + Task 7 指定台词）。 */
interface SmokeScenario {
  id: string;
  label: string;
  query: string;
  stage?: number;
  topics?: string[];
  /** 负样本：要求 no_match 且 0 节 0 表。 */
  expectNoMatch?: boolean;
  /** 该场景重点看的指标（只用于报告展示）。 */
  note: string;
}

const SCENARIOS: SmokeScenario[] = [
  {
    id: 'ckd-stage2-phosphate',
    label: 'CKD 2 期血磷',
    query: 'CKD dog stage 2 serum phosphate target',
    stage: 2,
    topics: ['phosphorus'],
    note: 'stage 2 + phosphorus：分期只扩召回，不做硬过滤',
  },
  {
    id: 'ckd-stage3-phosphate',
    label: 'CKD 3 期血磷',
    query: 'CKD dog stage 3 serum phosphate target',
    stage: 3,
    note: 'stage 3：s005 的 Stage 3 原文不含 phosphate 也要出现',
  },
  {
    id: 'ckd-stage4-anemia',
    label: 'CKD 4 期贫血',
    query: 'CKD dog stage 4 anemia quality of life',
    stage: 4,
    note: 'stage 4 + anemia：非磷主题也能打开并引用',
  },
  {
    id: 'ckd-stage2-upc-bp',
    label: 'CKD 2 期 + UPC + 血压',
    query: 'CKD dog stage 2 UPC blood pressure',
    stage: 2,
    note: 'UPC / 血压同题：多主题召回',
  },
  {
    id: 'negative-vitamin-k',
    label: '非 CKD 对照（维生素 K）',
    query: 'CKD dog vitamin K target',
    expectNoMatch: true,
    note: '负样本：topicPhrase 门禁，必须 no_match',
  },
];

interface SearchSection {
  sectionId: string;
  displayTitle: string;
  sectionTitle: string;
  pageStart: number | null;
  passages: Array<{ id: string; citationId: string }>;
}

interface SearchTable {
  tableId: string;
  caption: string;
  pageNo: number | null;
  citationId: string;
}

interface SearchData {
  status: string;
  sections: SearchSection[];
  tables: SearchTable[];
}

interface OpenData {
  status: string;
  citationId?: string;
  citationIds?: string[];
  section?: {
    sectionId: string;
    anchorFound: boolean;
    paragraphs: Array<{ id: string; citationId: string; text: string }>;
  };
  table?: {
    tableId: string;
    caption: string;
    pageNo: number | null;
    rowCount: number;
  };
}

interface TableRecovery {
  tableId: string;
  citationId: string;
  ok: boolean;
  /** 打开后 registry 里的记录（K 号恢复/去重）。 */
  registryKind: string | null;
  error?: string;
}

interface ScenarioResult {
  id: string;
  label: string;
  query: string;
  note: string;
  status: string;
  expectedNoMatch: boolean;
  sectionCount: number;
  tableCount: number;
  topSectionId: string | null;
  topCitationId: string | null;
  passageId: string | null;
  openOk: boolean;
  anchorFound: boolean;
  sameCitationId: boolean;
  auditCitationCount: number;
  auditValidCount: number;
  auditInvalidCount: number;
  tableRecovery: TableRecovery | null;
  passed: boolean;
  reason: string;
  ms: number;
  error?: string;
}

interface CliOptions {
  write: boolean;
  outPath: string;
}

function parseArgv(argv: string[]): CliOptions {
  const index = argv.findIndex((item) => item === '--out');
  const value = index >= 0 ? String(argv[index + 1] ?? '').trim() : '';
  return {
    write: !(argv.includes('--no-write') || argv.includes('--check')),
    outPath: value ? resolve(process.cwd(), value) : DEFAULT_OUT,
  };
}

function makeContext(
  library: KnowledgeLibraryService,
  sourceLayer: SourceLayerService,
): ToolExecutionContext {
  return {
    port: {} as any,
    catalog: {} as any,
    library,
    sourceLayer,
    citations: new CitationRegistry(),
    onAsk: () => {},
  };
}

function displayPath(absolute: string): string {
  const rel = relative(REPO_ROOT, absolute);
  return rel && !rel.startsWith('..') ? rel : absolute;
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 表格 K 恢复（可选，不计入 5/5）：检索命中表格时，用检索登记的 K 打开，
 * 断言打开的是同一张表，且 registry 里仍能按 K 找回。
 */
async function checkTableRecovery(
  table: SearchTable,
  context: ToolExecutionContext,
): Promise<TableRecovery> {
  if (!table.citationId) {
    return {
      tableId: table.tableId,
      citationId: '',
      ok: false,
      registryKind: null,
      error: '检索未登记 citationId',
    };
  }
  const outcome = await executeTool(
    'open_knowledge',
    { citationId: table.citationId },
    context,
  );
  if (!outcome.ok) {
    return {
      tableId: table.tableId,
      citationId: table.citationId,
      ok: false,
      registryKind: null,
      error: `${outcome.error?.code}: ${outcome.error?.message}`,
    };
  }
  const data = outcome.data as OpenData;
  const record = context.citations.get(data.citationId ?? table.citationId);
  const problems: string[] = [];
  if (data.status !== 'ok') problems.push(`status=${data.status}`);
  if (data.table?.tableId !== table.tableId) {
    problems.push(`按 K 打开的是 ${data.table?.tableId ?? '—'}`);
  }
  if (!record || record.kind !== 'table') {
    problems.push('registry 里没有表格记录');
  }
  return {
    tableId: table.tableId,
    citationId: data.citationId ?? table.citationId,
    ok: problems.length === 0,
    registryKind: record?.kind ?? null,
    ...(problems.length > 0 ? { error: problems.join('；') } : {}),
  };
}

async function runScenario(
  spec: SmokeScenario,
  library: KnowledgeLibraryService,
  sourceLayer: SourceLayerService,
): Promise<ScenarioResult> {
  const context = makeContext(library, sourceLayer);
  const startedAt = performance.now();
  const base: ScenarioResult = {
    id: spec.id,
    label: spec.label,
    query: spec.query,
    note: spec.note,
    status: 'error',
    expectedNoMatch: Boolean(spec.expectNoMatch),
    sectionCount: 0,
    tableCount: 0,
    topSectionId: null,
    topCitationId: null,
    passageId: null,
    openOk: false,
    anchorFound: false,
    sameCitationId: false,
    auditCitationCount: 0,
    auditValidCount: 0,
    auditInvalidCount: 0,
    tableRecovery: null,
    passed: false,
    reason: '',
    ms: 0,
  };

  try {
    const searchOutcome = await executeTool(
      'search_knowledge_library',
      {
        query: spec.query,
        ...(spec.stage ? { stage: spec.stage } : {}),
        ...(spec.topics && spec.topics.length > 0 ? { topics: spec.topics } : {}),
        limit: 5,
      },
      context,
    );
    if (!searchOutcome.ok) {
      return {
        ...base,
        ms: roundMs(performance.now() - startedAt),
        reason: `检索报错 ${searchOutcome.error?.code}: ${searchOutcome.error?.message}`,
        error: searchOutcome.error?.message,
      };
    }

    const data = searchOutcome.data as SearchData;
    const result: ScenarioResult = {
      ...base,
      status: data.status,
      sectionCount: data.sections.length,
      tableCount: data.tables.length,
    };

    // 负样本：要求 no_match 且 0 节 0 表（只返回表格也算有证据）。
    if (spec.expectNoMatch) {
      const passed =
        data.status === 'no_match' &&
        data.sections.length === 0 &&
        data.tables.length === 0;
      return {
        ...result,
        passed,
        reason: passed
          ? '负样本正确返回 no_match（0 节 0 表）'
          : `负样本未返回 no_match（status=${data.status}，${data.sections.length} 节 ${data.tables.length} 表）`,
        ms: roundMs(performance.now() - startedAt),
      };
    }

    const top = data.sections[0];
    const passage = top?.passages[0];
    if (!top || !passage?.citationId) {
      return {
        ...result,
        reason: '检索未返回可引用的节/段落',
        ms: roundMs(performance.now() - startedAt),
      };
    }

    result.topSectionId = top.sectionId;
    result.topCitationId = passage.citationId;
    result.passageId = passage.id;

    const openOutcome = await executeTool(
      'open_knowledge',
      { citationId: passage.citationId },
      context,
    );
    if (!openOutcome.ok) {
      return {
        ...result,
        reason: `按 ${passage.citationId} 打开失败：${openOutcome.error?.code}: ${openOutcome.error?.message}`,
        ms: roundMs(performance.now() - startedAt),
      };
    }

    const openData = openOutcome.data as OpenData;
    const openedSection = openData.section;
    const openedPassage = openedSection?.paragraphs.find(
      (item) => item.id === passage.id,
    );
    result.openOk = openData.status === 'ok';
    result.anchorFound = Boolean(openedSection?.anchorFound);
    result.sameCitationId =
      openedPassage?.citationId === passage.citationId &&
      (openData.citationIds ?? []).includes(passage.citationId);

    // 用「数值 + [K#]」的短句走一遍 audit：引用必须能在本次 registry 里对上。
    const audit = context.citations.audit(
      `磷 0.2–0.5% DM [${passage.citationId}]`,
    );
    result.auditCitationCount = audit.citationCount;
    result.auditValidCount = audit.validCitationCount;
    result.auditInvalidCount = audit.invalidCitationCount;

    // 表格 K 恢复：检索命中表格时顺手验一次（可选，不影响 5/5）。
    if (data.tables[0]) {
      result.tableRecovery = await checkTableRecovery(data.tables[0], context);
    }

    const problems: string[] = [];
    if (openData.status !== 'ok') problems.push(`open status=${openData.status}`);
    if (!openedSection) problems.push('open 未返回 section');
    if (!result.anchorFound) problems.push('anchorFound=false');
    if (!openedPassage) problems.push('打开的节里没有该段');
    if (!result.sameCitationId) problems.push('K 号不一致');
    if (audit.citationCount !== 1) {
      problems.push(`audit 引用数=${audit.citationCount}`);
    }
    if (audit.validCitationCount !== 1) {
      problems.push(`audit 有效引用=${audit.validCitationCount}`);
    }
    if (audit.invalidCitationCount !== 0) {
      problems.push(`audit 无效引用=${audit.invalidCitationCount}`);
    }

    return {
      ...result,
      passed: problems.length === 0,
      reason:
        problems.length === 0
          ? `${top.sectionId} 的段可打开、K 号一致、引用有效`
          : problems.join('；'),
      ms: roundMs(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      ...base,
      ms: roundMs(performance.now() - startedAt),
      reason: `异常：${(error as Error).message}`,
      error: (error as Error).message,
    };
  }
}

function shortDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function buildMarkdown(
  results: ScenarioResult[],
  options: CliOptions,
  exitCode: 0 | 1,
): string {
  const passed = results.filter((item) => item.passed).length;
  const invalid = results.reduce(
    (sum, item) => sum + item.auditInvalidCount,
    0,
  );
  const tables = results.filter((item) => item.tableRecovery);
  const tableOk = tables.filter((item) => item.tableRecovery?.ok).length;

  const lines: string[] = [
    '# CKD 知识库 5 场景引用冒烟（自动生成）',
    '',
    `> 生成时间：${shortDate(new Date())}　|　脚本：\`backend/scripts/knowledge-base/evaluate-citation-smoke.ts\``,
    '>',
    '> 走 Agent 工具层：`executeTool(\'search_knowledge_library\')` → 取 top 节第一段的 `citationId` → `executeTool(\'open_knowledge\', { citationId })` → 断言打开的节里仍有该段、K 号一致 → `CitationRegistry.audit(\'磷 0.2–0.5% DM [K#]\')`。',
    '> 第 5 个场景是负样本：`CKD dog vitamin K target` 必须 `no_match` 且 0 节 0 表。',
    ...(options.write
      ? []
      : ['>', '> 本次以 `--no-write` 运行：只验证，未覆盖仓库里的报告文件。']),
    '',
    '## 总览',
    '',
    '| 指标 | 实际 | 目标 | 结果 |',
    '|---|---|---|---|',
    `| 场景通过 | ${passed}/${results.length} | 5/5 | ${passed === results.length ? '通过' : '未通过'} |`,
    `| 无效引用 | ${invalid} | 0 | ${invalid === 0 ? '通过' : '未通过'} |`,
    `| 表格 K 恢复（可选） | ${tables.length === 0 ? '本组无表格命中' : `${tableOk}/${tables.length}`} | — | — |`,
    `| 退出码 | ${exitCode} | 0 | ${exitCode === 0 ? '通过' : '未通过'} |`,
    '',
    '## 5 场景明细',
    '',
    '| # | 场景 | 查询 | 提示 | status | 节/表 | top 节 | 引用 K | 打开 | audit 有效/无效 | 结果 | 耗时 |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];

  for (const [index, item] of results.entries()) {
    const hints = [
      SCENARIOS[index]?.stage ? `stage:${SCENARIOS[index].stage}` : '',
      SCENARIOS[index]?.topics?.length
        ? `topics:${SCENARIOS[index].topics!.join(',')}`
        : '',
    ]
      .filter(Boolean)
      .join('，');
    const topSection = item.topSectionId
      ? `${item.topSectionId}${item.passageId ? `<br>段 \`${item.passageId}\`` : ''}`
      : '—';
    const openCell = item.expectedNoMatch
      ? '—'
      : item.passed
        ? `✔${item.anchorFound ? '（锚点命中）' : ''}`
        : '✘';
    lines.push(
      `| ${index + 1} | ${item.label} | ${item.query} | ${hints || '—'} | ${item.status} | ${item.sectionCount}/${item.tableCount} | ${topSection} | ${item.topCitationId ?? '—'} | ${openCell} | ${item.auditValidCount}/${item.auditInvalidCount} | ${item.passed ? '✅' : '❌'} | ${item.ms}ms |`,
    );
  }

  lines.push('', '## 说明（逐场景）', '');
  for (const [index, item] of results.entries()) {
    lines.push(
      `${index + 1}. **${item.label}**（\`${item.query}\`）：${item.passed ? '通过' : '未通过'} — ${item.reason}`,
    );
    if (item.tableRecovery) {
      lines.push(
        `   - 表格 K 恢复（可选）：${item.tableRecovery.tableId} / ${item.tableRecovery.citationId || '—'} ${item.tableRecovery.ok ? '✔' : `✘（${item.tableRecovery.error ?? '打不开'}）`}`,
      );
    }
  }

  lines.push(
    '',
    '## 说明',
    '',
    '- 引用冒烟只验「检索 → 打开 → K 号有效」，不验临床结论对错。',
    '- 第 5 个场景（`CKD dog vitamin K target`）是负样本：`topicPhrases` 门禁要求命中 `vitamin k` 短语，不能因为命中 `vitamin` 就算过；0 节 0 表才算通过。',
    '- 表格 K 恢复是可选诊断：检索命中表格时，用检索登记的 K 打开同一张表并确认 registry 里仍有该记录；不参与 5/5 判定。',
    '- 退出码：任一场景不通过 → 1。',
    '',
  );

  return lines.join('\n');
}

(async () => {
  const prisma = new PrismaClient();
  const options = parseArgv(process.argv.slice(2));
  let exitCode: 0 | 1 = 0;
  try {
    const library = new KnowledgeLibraryService(prisma as any);
    const sourceLayer = new SourceLayerService(prisma as any);
    const results: ScenarioResult[] = [];

    for (const [index, spec] of SCENARIOS.entries()) {
      const result = await runScenario(spec, library, sourceLayer);
      results.push(result);
      console.log(
        `${result.passed ? '✔' : '✘'} ${index + 1}/5 ${result.label}（${result.query}）${result.ms}ms — ${result.reason}`,
      );
    }

    const passed = results.filter((item) => item.passed).length;
    const invalid = results.reduce(
      (sum, item) => sum + item.auditInvalidCount,
      0,
    );
    exitCode = passed === results.length && invalid === 0 ? 0 : 1;

    const markdown = buildMarkdown(results, options, exitCode);
    if (options.write) {
      writeFileSync(options.outPath, markdown);
    }

    console.log('');
    console.log(`引用冒烟：${passed}/${results.length} 通过；无效引用 ${invalid}`);
    const tableResults = results.filter((item) => item.tableRecovery);
    if (tableResults.length > 0) {
      console.log(
        `表格 K 恢复（可选）：${tableResults
          .map(
            (item) =>
              `${item.tableRecovery!.tableId}${item.tableRecovery!.ok ? '✔' : '✘'}`,
          )
          .join(' ')}`,
      );
    }
    if (options.write) {
      console.log(`报告：${displayPath(options.outPath)}`);
    } else {
      console.log('--no-write：未写入报告');
      console.log('');
      console.log(markdown);
    }
  } finally {
    await prisma.$disconnect();
  }
  process.exitCode = exitCode;
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
