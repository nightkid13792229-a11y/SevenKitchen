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
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { KnowledgeLibraryService } from '../../src/application/knowledge-base/knowledge-library.service';
import { SourceLayerService } from '../../src/application/knowledge-base/source-layer.service';
import { CitationRegistry } from '../../src/application/recipe-designer/agent/citation-registry';
import { resolveKnowledgeScope } from '../../src/domain/knowledge/knowledge-scope';
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
    label: '未覆盖营养素对照（维生素 K）',
    query: 'CKD dog vitamin K target',
    expectNoMatch: true,
    note: '负样本：仍在 CKD 检索范围内，但 CKD 语料未覆盖 vitamin K；topicPhrase 门禁必须 no_match',
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

interface TableReuse {
  tableId: string;
  citationId: string;
  ok: boolean;
  /** 打开后 registry 里的记录（同一 registry 按 K 复用/回源，不是会话恢复）。 */
  registryKind: string | null;
  error?: string;
}

interface ScopeGuardResult {
  documentRejected: boolean;
  sourceRejected: boolean;
  detail: string;
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
  /** 新 registry `restore(record)` 后 audit 是否仍有效（会话恢复的附加证据）。 */
  restoreOk: boolean;
  restoreValidCount: number;
  restoreInvalidCount: number;
  tableReuse: TableReuse | null;
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
  const write = !(argv.includes('--no-write') || argv.includes('--check'));
  const index = argv.findIndex((item) => item === '--out');
  if (index >= 0) {
    const value = String(argv[index + 1] ?? '').trim();
    if (!value || value.startsWith('--')) {
      throw new Error(
        '--out 需要一个输出路径（例：--out docs/knowledge-base/ckd-structure/citation-smoke.md）',
      );
    }
    return { write, outPath: resolve(process.cwd(), value) };
  }
  return { write, outPath: DEFAULT_OUT };
}

function makeContext(
  library: KnowledgeLibraryService,
  sourceLayer: SourceLayerService,
): ToolExecutionContext {
  return {
    scope: resolveKnowledgeScope(['ckd']),
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
 * 表格 K 复用/回源（可选，不计入 5/5）：检索命中表格时，用检索登记的 K 打开，
 * 断言打开的是同一张表，且同一 registry 里仍能按 K 找回。
 *
 * 注意：这里验的是「同一会话内 K 号复用/回源」，不是跨会话恢复；
 * 真正的 session restore 由 `citation-registry.spec.ts` 覆盖。
 */
async function checkTableReuse(
  table: SearchTable,
  context: ToolExecutionContext,
): Promise<TableReuse> {
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

/**
 * 范围校验（附加，不计入 5/5）：配方侧传非 CKD `documentIds`/`sourceIds`
 * 必须被 `OUT_OF_SCOPE` 拒绝，不能悄悄退化成全库。
 */
async function runScopeGuard(
  library: KnowledgeLibraryService,
  sourceLayer: SourceLayerService,
): Promise<ScopeGuardResult> {
  const context = makeContext(library, sourceLayer);
  const documentOutcome = await executeTool(
    'search_knowledge_library',
    { query: 'CKD dog phosphorus', documentIds: ['not-in-ckd-library'] },
    context,
  );
  const sourceOutcome = await executeTool(
    'search_knowledge_library',
    { query: 'CKD dog phosphorus', sourceIds: ['NOT-A-CKD-SOURCE'] },
    context,
  );
  const documentRejected =
    !documentOutcome.ok && documentOutcome.error?.code === 'OUT_OF_SCOPE';
  const sourceRejected =
    !sourceOutcome.ok && sourceOutcome.error?.code === 'OUT_OF_SCOPE';
  return {
    documentRejected,
    sourceRejected,
    detail: [
      `非 CKD documentIds：${documentRejected ? 'OUT_OF_SCOPE ✔' : `未拒绝（${documentOutcome.error?.code ?? 'ok'}）`}`,
      `非 CKD sourceIds：${sourceRejected ? 'OUT_OF_SCOPE ✔' : `未拒绝（${sourceOutcome.error?.code ?? 'ok'}）`}`,
    ].join('；'),
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
    restoreOk: false,
    restoreValidCount: 0,
    restoreInvalidCount: 0,
    tableReuse: null,
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

    // 用「数值 + [K#]」的固定句式走一遍 audit：只验引用格式能对上，不代表临床结论。
    const fixture = `磷 0.2–0.5% DM [${passage.citationId}]`;
    const audit = context.citations.audit(fixture);
    result.auditCitationCount = audit.citationCount;
    result.auditValidCount = audit.validCitationCount;
    result.auditInvalidCount = audit.invalidCitationCount;

    // 会话恢复（可选）：把 record 灌进一个全新的 registry，再 audit 同一句。
    // 这不是本次 5/5 的判定项；主证据在 citation-registry.spec.ts。
    const record = context.citations.get(passage.citationId);
    if (record) {
      const restored = new CitationRegistry();
      restored.restore(record);
      const restoredAudit = restored.audit(fixture);
      result.restoreOk =
        restoredAudit.validCitationCount === 1 &&
        restoredAudit.invalidCitationCount === 0;
      result.restoreValidCount = restoredAudit.validCitationCount;
      result.restoreInvalidCount = restoredAudit.invalidCitationCount;
    }

    // 表格 K 复用/回源：检索命中表格时顺手验一次（可选，不影响 5/5）。
    if (data.tables[0]) {
      result.tableReuse = await checkTableReuse(data.tables[0], context);
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
  scopeGuard: ScopeGuardResult,
): string {
  const passed = results.filter((item) => item.passed).length;
  const invalid = results.reduce(
    (sum, item) => sum + item.auditInvalidCount,
    0,
  );
  const tables = results.filter((item) => item.tableReuse);
  const tableOk = tables.filter((item) => item.tableReuse?.ok).length;
  const restores = results.filter((item) => !item.expectedNoMatch);
  const restoreOk = restores.filter((item) => item.restoreOk).length;
  const scopeOk = scopeGuard.documentRejected && scopeGuard.sourceRejected;

  const lines: string[] = [
    '# CKD 知识库 5 场景引用冒烟（自动生成）',
    '',
    `> 生成时间：${shortDate(new Date())}　|　脚本：\`backend/scripts/knowledge-base/evaluate-citation-smoke.ts\``,
    '>',
    '> 走 Agent 工具层：`executeTool(\'search_knowledge_library\')` → 取 top 节第一段的 `citationId` → `executeTool(\'open_knowledge\', { citationId })` → 断言打开的节里仍有该段、K 号一致 → `CitationRegistry.audit(\'磷 0.2–0.5% DM [K#]\')`。',
    '> 第 5 个场景是**未覆盖营养素对照**：仍在 CKD 检索范围内，但 CKD 语料未覆盖 `vitamin K`；必须 `no_match` 且 0 节 0 表。',
    '>',
    '> 本报告为**本地库实测（159 份文档 / 27,902 段）；生产未跑全量**。',
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
    `| 表格 K 复用/回源（可选） | ${tables.length === 0 ? '本组无表格命中' : `${tableOk}/${tables.length}`} | — | — |`,
    `| 会话恢复（可选） | ${restoreOk}/${restores.length} | — | — |`,
    `| 范围校验（附加） | ${scopeGuard.documentRejected ? 'documentIds ✔' : 'documentIds ✘'} / ${scopeGuard.sourceRejected ? 'sourceIds ✔' : 'sourceIds ✘'} | 非 CKD 被拒 | ${scopeOk ? '通过' : '未通过'} |`,
    `| 退出码 | ${exitCode} | 0 | ${exitCode === 0 ? '通过' : '未通过'} |`,
    '',
    '## 5 场景明细',
    '',
    '| # | 场景 | 查询 | 提示 | status | 节/表 | top 节 | 引用 K | 打开 | audit 有效/无效 | 会话恢复（可选） | 结果 | 耗时 |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
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
    const restoreCell = item.expectedNoMatch
      ? '—'
      : item.restoreOk
        ? '✔'
        : '✘';
    lines.push(
      `| ${index + 1} | ${item.label} | ${item.query} | ${hints || '—'} | ${item.status} | ${item.sectionCount}/${item.tableCount} | ${topSection} | ${item.topCitationId ?? '—'} | ${openCell} | ${item.auditValidCount}/${item.auditInvalidCount} | ${restoreCell} | ${item.passed ? '✅' : '❌'} | ${item.ms}ms |`,
    );
  }

  lines.push('', '## 说明（逐场景）', '');
  for (const [index, item] of results.entries()) {
    lines.push(
      `${index + 1}. **${item.label}**（\`${item.query}\`）：${item.passed ? '通过' : '未通过'} — ${item.reason}`,
    );
    if (item.tableReuse) {
      lines.push(
        `   - 表格 K 复用/回源（可选）：${item.tableReuse.tableId} / ${item.tableReuse.citationId || '—'} ${item.tableReuse.ok ? '✔' : `✘（${item.tableReuse.error ?? '打不开'}）`}`,
      );
    }
    if (!item.expectedNoMatch) {
      lines.push(
        `   - 会话恢复（可选）：\`new CitationRegistry().restore(record)\` 后 audit ${item.restoreOk ? '仍有效 ✔' : '失效 ✘'}（有效/无效 ${item.restoreValidCount}/${item.restoreInvalidCount}）`,
      );
    }
  }

  lines.push(
    '',
    '## 说明',
    '',
    '- 引用冒烟只验「检索 → 打开 → K 号有效」，不验临床结论对错。',
    '- `磷 0.2–0.5% DM [K#]` 是固定引用句式 fixture，只验证引用能对上，**不代表任何临床结论或推荐值**。',
    '- 第 5 个场景标签是**「未覆盖营养素对照」**：它仍在 CKD 检索范围内，只是 CKD 语料未覆盖 `vitamin K`；不要把它理解成「非 CKD 范围」用例。',
    '- 非 CKD 范围拒绝在「范围校验（附加）」里校验：非 CKD `documentIds`/`sourceIds` 必须 `OUT_OF_SCOPE`（' +
      scopeGuard.detail +
      '）。',
    '- 表格 K 复用/回源（可选）：同一 registry 内用检索登记的 K 打开同一张表并确认记录仍在；**这不是会话恢复**。',
    '- 会话恢复（可选）：`new CitationRegistry().restore(record)` 后 audit 同一句仍有效；真正的 session restore 主证据在 `citation-registry.spec.ts`。',
    '- 本报告是**本地库实测；生产未跑全量**。',
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

    const scopeGuard = await runScopeGuard(library, sourceLayer);
    const markdown = buildMarkdown(results, options, exitCode, scopeGuard);
    if (options.write) {
      mkdirSync(dirname(options.outPath), { recursive: true });
      writeFileSync(options.outPath, markdown);
    }

    console.log('');
    console.log(`引用冒烟：${passed}/${results.length} 通过；无效引用 ${invalid}`);
    console.log(`范围校验（附加）：${scopeGuard.detail}`);
    const tableResults = results.filter((item) => item.tableReuse);
    if (tableResults.length > 0) {
      console.log(
        `表格 K 复用/回源（可选）：${tableResults
          .map(
            (item) =>
              `${item.tableReuse!.tableId}${item.tableReuse!.ok ? '✔' : '✘'}`,
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
  if (error instanceof Error && error.message.startsWith('--out ')) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
