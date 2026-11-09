/**
 * 26 题回归评估（走 Agent 工具层，spec v1.1 §8 / 附录 A）。
 *
 * 与旧的 `evaluate-ckd-routing.ts` 的区别：这里调 `executeTool('search_knowledge_library')`，
 * 判分的是模型真正看到的东西（节分组、citationId、表格摘要），不是裸服务。
 *
 * 用法（需要 `.env` 里的 DATABASE_URL）：
 * - `npm run kb:eval`                     → 跑 26 题并写入 `library-evaluation.md/.json`
 * - `npm run kb:eval -- --no-write`       → 只验证，不覆盖已提交的报告（Task 7 用这个）
 * - `npm run kb:eval -- --check`          → `--no-write` 的别名
 * - `npm run kb:eval -- --questions <x>`  → 换题集做对照（JSON 里会写实际路径）
 *
 * 退出码：`library-eval.ts` 的 `buildGateChecks` 有任何一条不过 → 1
 * （整体/Stage 3/表格/中文/负样本/对抗/核心表/p95/max）。
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { KnowledgeLibraryService } from '../../src/application/knowledge-base/knowledge-library.service';
import { SourceLayerService } from '../../src/application/knowledge-base/source-layer.service';
import { CitationRegistry } from '../../src/application/recipe-designer/agent/citation-registry';
import {
  executeTool,
  type ToolExecutionContext,
} from '../../src/application/recipe-designer/agent/tools';
import {
  LIBRARY_THRESHOLDS,
  buildGateChecks,
  exitCodeFor,
  judgeQuestion,
  tableQuestionTargets,
  type GateCheck,
  type LibraryGateSummary,
  type QuestionCategory,
  type QuestionSpec,
} from '../../src/application/knowledge-base/library-eval';

/** Stage 3 硬指标的那一题（spec 附录 A Q10；Q11 中文题另计入中文）。 */
const STAGE3_QUESTION_IDS = ['stage3'];

/** 5 组核心表（spec §7.5；T0253=37-1、T0497=37-9、T0260/61=37-11/12、T0025/26=AAHA 表 8）。 */
const CORE_TABLE_IDS = ['T0253', 'T0497', 'T0260', 'T0261', 'T0025', 'T0026'];

const REPO_ROOT = resolve(__dirname, '../../..');
const DEFAULT_QUESTIONS_PATH = resolve(
  REPO_ROOT,
  'docs/knowledge-base/ckd-structure/library-questions.json',
);
const OUTPUT_DIR = resolve(REPO_ROOT, 'docs/knowledge-base/ckd-structure');

interface CliOptions {
  questionsPath: string;
  /** `--no-write` / `--check`：只验证，不覆盖已提交的报告。 */
  write: boolean;
}

function parseArgv(argv: string[]): CliOptions {
  const index = argv.findIndex((item) => item === '--questions');
  const value = index >= 0 ? String(argv[index + 1] ?? '').trim() : '';
  return {
    questionsPath: value ? resolve(process.cwd(), value) : DEFAULT_QUESTIONS_PATH,
    write: !(argv.includes('--no-write') || argv.includes('--check')),
  };
}

/** 报告里展示的题集路径：仓库内用相对路径，仓库外保留绝对路径。 */
function displayPath(absolute: string): string {
  const rel = relative(REPO_ROOT, absolute);
  return rel && !rel.startsWith('..') ? rel : absolute;
}

interface LibraryToolData {
  status: string;
  query: string;
  sections: Array<{
    sectionId: string;
    displayTitle: string;
    sectionTitle: string;
    pageStart: number | null;
    passages: Array<{ citationId: string }>;
  }>;
  tables: Array<{
    tableId: string;
    caption: string;
    pageNo: number | null;
    rowCount: number;
    citationId: string;
  }>;
}

interface OpenCheck {
  tableId: string;
  ok: boolean;
  citationId?: string;
  pageNo?: number | null;
  rowCount?: number;
  error?: string;
}

interface QuestionRun {
  index: number;
  id: string;
  category: QuestionCategory;
  query: string;
  status: string;
  /** 工具返回的全部节（≤5）。 */
  sections: Array<{
    sectionId: string;
    displayTitle: string;
    pageStart: number | null;
    citationId: string;
  }>;
  tables: Array<{
    tableId: string;
    caption: string;
    citationId: string;
  }>;
  /** 表格题的 open_knowledge 校验结果（只含检索命中的表）。 */
  opened: OpenCheck[];
  passed: boolean;
  reason: string;
  ms: number;
  error?: string;
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

/** 最近秩百分位（p50/p95），单位 ms，保留一位小数。 */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return Math.round(sorted[index] * 10) / 10;
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 按**检索返回的 citationId** 打开表格，复用同一题的 context/registry：
 * 验的是「模型看到的 K 号真能打开」，而不是「用表 id 另行打开」。
 */
async function openByCitation(
  target: { tableId: string; citationId: string },
  context: ToolExecutionContext,
): Promise<OpenCheck> {
  if (!target.citationId) {
    return {
      tableId: target.tableId,
      ok: false,
      error: '检索未登记 citationId，无法按 K 打开',
    };
  }
  const outcome = await executeTool(
    'open_knowledge',
    { citationId: target.citationId },
    context,
  );
  if (!outcome.ok) {
    return {
      tableId: target.tableId,
      ok: false,
      citationId: target.citationId,
      error: `${outcome.error?.code}: ${outcome.error?.message}`,
    };
  }
  const data = outcome.data as {
    status: string;
    table?: { tableId: string; pageNo: number | null; rowCount: number };
    citationId?: string;
  };
  const openedTableId = String(data.table?.tableId ?? '').trim();
  const problems: string[] = [];
  if (data.status !== 'ok') problems.push(`status=${data.status}`);
  if (!data.citationId) problems.push('open 未返回 citationId');
  if (openedTableId && openedTableId !== target.tableId) {
    problems.push(`按 ${target.citationId} 打开的是 ${openedTableId}`);
  }
  return {
    tableId: target.tableId,
    ok: problems.length === 0,
    citationId: data.citationId ?? target.citationId,
    pageNo: data.table?.pageNo ?? null,
    rowCount: data.table?.rowCount,
    ...(problems.length > 0 ? { error: problems.join('；') } : {}),
  };
}

/**
 * 核心表能力检查：库里有没有这张表、`open_knowledge({tableId})` 能不能打开、有没有 K 号。
 *
 * 这一组不挂在某道题上（T0025/T0026 没有任何检索题必然命中），所以单独用新 context；
 * 表格题的「命中且按 K 打开」在上面的 `openByCitation` 里验。
 */
async function checkOpenTable(
  tableId: string,
  library: KnowledgeLibraryService,
  sourceLayer: SourceLayerService,
): Promise<OpenCheck> {
  const context = makeContext(library, sourceLayer);
  const outcome = await executeTool('open_knowledge', { tableId }, context);
  if (!outcome.ok) {
    return {
      tableId,
      ok: false,
      error: `${outcome.error?.code}: ${outcome.error?.message}`,
    };
  }
  const data = outcome.data as {
    status: string;
    table?: { tableId: string; pageNo: number | null; rowCount: number };
    citationId?: string;
  };
  return {
    tableId,
    ok: data.status === 'ok' && Boolean(data.citationId),
    citationId: data.citationId,
    pageNo: data.table?.pageNo ?? null,
    rowCount: data.table?.rowCount,
    ...(data.citationId ? {} : { error: 'open 未返回 citationId' }),
  };
}

function shortDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function categoryStats(runs: QuestionRun[], category: QuestionCategory) {
  const list = runs.filter((run) => run.category === category);
  return { passed: list.filter((run) => run.passed).length, total: list.length };
}

(async () => {
  const prisma = new PrismaClient();
  const options = parseArgv(process.argv.slice(2));
  let exitCode: 0 | 1 = 0;
  try {
    const library = new KnowledgeLibraryService(prisma as any);
    const sourceLayer = new SourceLayerService(prisma as any);
    const payload = JSON.parse(
      readFileSync(options.questionsPath, 'utf8'),
    ) as {
      questions: QuestionSpec[];
    };
    const questions = payload.questions;
    const runs: QuestionRun[] = [];

    for (const [index, spec] of questions.entries()) {
      // 每个问题一个引用登记表：跨题复用会把 K 号算串（会话恢复也按题算）。
      const context = makeContext(library, sourceLayer);
      const startedAt = performance.now();
      let run: QuestionRun;
      try {
        const outcome = await executeTool(
          'search_knowledge_library',
          {
            query: spec.query,
            ...(spec.species ? { species: spec.species } : {}),
            ...(spec.stage ? { stage: spec.stage } : {}),
            ...(spec.topics && spec.topics.length > 0
              ? { topics: spec.topics }
              : {}),
            limit: 5,
          },
          context,
        );
        const elapsed = roundMs(performance.now() - startedAt);

        if (!outcome.ok) {
          run = {
            index: index + 1,
            id: spec.id,
            category: spec.category,
            query: spec.query,
            status: 'error',
            sections: [],
            tables: [],
            opened: [],
            passed: false,
            reason: `工具报错 ${outcome.error?.code}: ${outcome.error?.message}`,
            ms: elapsed,
            error: outcome.error?.message,
          };
        } else {
          const data = outcome.data as LibraryToolData;
          // 表格题：只打开「检索真的返回了、且属于期望表」的那几张，并且用检索登记的 K。
          const targets = tableQuestionTargets(spec, data.tables);
          const opened: OpenCheck[] = [];
          for (const target of targets) {
            opened.push(await openByCitation(target, context));
          }
          const verdict = judgeQuestion(
            {
              status: data.status,
              sections: data.sections,
              tables: data.tables,
              openedTables: opened,
            },
            spec,
          );
          run = {
            index: index + 1,
            id: spec.id,
            category: spec.category,
            query: spec.query,
            status: data.status,
            sections: data.sections.map((section) => ({
              sectionId: section.sectionId,
              displayTitle: section.displayTitle,
              pageStart: section.pageStart,
              citationId: section.passages[0]?.citationId ?? '',
            })),
            tables: data.tables.map((table) => ({
              tableId: table.tableId,
              caption: table.caption,
              citationId: table.citationId,
            })),
            opened,
            passed: verdict.passed,
            reason: verdict.reason,
            ms: elapsed,
          };
        }
      } catch (error) {
        run = {
          index: index + 1,
          id: spec.id,
          category: spec.category,
          query: spec.query,
          status: 'error',
          sections: [],
          tables: [],
          opened: [],
          passed: false,
          reason: `异常：${(error as Error).message}`,
          ms: roundMs(performance.now() - startedAt),
          error: (error as Error).message,
        };
      }
      runs.push(run);
      console.log(
        `${run.passed ? '✔' : '✘'} ${String(run.index).padStart(2, '0')} ${run.id} (${run.category}) ${run.ms}ms — ${run.reason}`,
      );
    }

    // 6 张核心表：独立上下文逐张打开（能力检查）。
    const coreTables: OpenCheck[] = [];
    for (const tableId of CORE_TABLE_IDS) {
      coreTables.push(await checkOpenTable(tableId, library, sourceLayer));
    }

    const overall = runs.filter((run) => run.passed).length;
    const tableStats = categoryStats(runs, 'table');
    const zhStats = categoryStats(runs, 'zh');
    const negativeStats = categoryStats(runs, 'negative');
    const adversarialStats = categoryStats(runs, 'adversarial');
    const stage3Runs = runs.filter((run) => STAGE3_QUESTION_IDS.includes(run.id));
    const stage3Passed = stage3Runs.filter((run) => run.passed).length;
    const timings = runs.map((run) => run.ms);
    const p50 = percentile(timings, 0.5);
    const p95 = percentile(timings, 0.95);
    const max = timings.length > 0 ? Math.max(...timings) : 0;
    const coreTablePassed = coreTables.filter((table) => table.ok).length;

    const gateSummary: LibraryGateSummary = {
      overall,
      total: runs.length,
      stage3: { passed: stage3Passed, total: stage3Runs.length },
      table: tableStats,
      zh: zhStats,
      negative: negativeStats,
      adversarial: adversarialStats,
      coreTables: { passed: coreTablePassed, total: coreTables.length },
      timing: { p50, p95, max },
    };
    const checks: GateCheck[] = buildGateChecks(gateSummary);
    exitCode = exitCodeFor(checks);
    const questionsFile = displayPath(options.questionsPath);

    const generatedAt = new Date();
    const lines: string[] = [
      '# CKD 知识库 26 题回归结果（自动生成）',
      '',
      `> 生成时间：${shortDate(generatedAt)}　|　题集：\`${questionsFile}\`　|　脚本：\`backend/scripts/knowledge-base/evaluate-library.ts\``,
      '>',
      '> 走 Agent 工具层：每题一个全新的 `CitationRegistry`，调 `executeTool(\'search_knowledge_library\', { query, species, stage, topics, limit: 5 })`；表格题再用**检索返回的 citationId** 调 `open_knowledge`。',
      '> 判分：spec v1.1 附录 A —— 前 3 节含任一期望节即通过；前 3 节出现禁止节即不通过；负样本要求 `no_match` 或「0 节 0 表」；表格题要求命中期望表**且**按检索的 K 打开成功。',
      ...(options.write
        ? []
        : ['>', '> 本次以 `--no-write` 运行：只验证，未覆盖仓库里的报告文件。']),
      '',
      '## 阶段出口',
      '',
      '| 指标 | 实际 | 目标 | 结果 |',
      '|---|---|---|---|',
      ...checks.map(
        (check) =>
          `| ${check.name} | ${check.actual} | ${check.target} | ${check.passed ? '通过' : '未通过'} |`,
      ),
      '',
      '## 耗时（单次工具调用，含检索 + 表格视图 + 引用登记；表格题另含按 K 打开）',
      '',
      `- p50：${p50}ms　p95：${p95}ms　max：${max}ms（目标 p95 <${LIBRARY_THRESHOLDS.p95Ms}ms、单次 <${LIBRARY_THRESHOLDS.maxMs / 1000}s）`,
      '',
      '## 6 张核心表',
      '',
      '> 核心表用 `open_knowledge({ tableId })` 直接打开（能力检查，不对应某道题）。',
      '',
      '| 表 | 打开 | citationId | 页码 | 行数 | 备注 |',
      '|---|---|---|---|---|---|',
      ...coreTables.map(
        (table) =>
          `| ${table.tableId} | ${table.ok ? '可打开' : '打不开'} | ${table.citationId ?? '—'} | ${table.pageNo === null || table.pageNo === undefined ? 'null' : table.pageNo} | ${table.rowCount ?? '—'} | ${table.error ?? ''} |`,
      ),
      '',
      '## 26 题明细',
      '',
      '| # | id | 类型 | status | 前 3 节 | 表格 | 结果 | 说明 | 耗时 |',
      '|---|---|---|---|---|---|---|---|---|',
    ];

    for (const run of runs) {
      const top3 = run.sections
        .slice(0, 3)
        .map(
          (section) =>
            `${section.sectionId}${section.pageStart === null ? '' : `（p${section.pageStart}）`}`,
        )
        .join('<br>');
      const tables =
        run.tables.length > 0
          ? run.tables
              .map((table) => `${table.tableId}（${table.citationId}）`)
              .join('<br>')
          : '—';
      const openedNote =
        run.opened.length > 0
          ? `<br>按 K 打开：${run.opened
              .map(
                (item) =>
                  `${item.tableId}${item.ok ? `✔（${item.citationId}）` : `✘（${item.error ?? '打不开'}）`}`,
              )
              .join('、')}`
          : '';
      lines.push(
        `| ${run.index} | ${run.id} | ${run.category} | ${run.status} | ${top3 || '—'} | ${tables} | ${run.passed ? '✅' : '❌'} | ${run.reason.replace(/\|/g, '\\|')}${openedNote} | ${run.ms}ms |`,
      );
    }

    lines.push(
      '',
      '## Q12 / Q13 / Q24 诊断（同文档多节裁剪的关注点）',
      '',
      '| id | 前 3 节 | 同文档节数 | 结果 |',
      '|---|---|---|---|',
      ...runs
        .filter((run) => ['zh-dietary', 'zh-protein', 'synonym'].includes(run.id))
        .map((run) => {
          const perDocument = new Map<string, number>();
          for (const section of run.sections) {
            const documentId = section.sectionId.replace(/-s\d+$/, '');
            perDocument.set(documentId, (perDocument.get(documentId) ?? 0) + 1);
          }
          const counts = [...perDocument.entries()]
            .map(([documentId, count]) => `${documentId}=${count}`)
            .join('；');
          return `| ${run.id} | ${run.sections
            .slice(0, 3)
            .map((section) => section.sectionId)
            .join('<br>')} | ${counts || '—'} | ${run.passed ? '✅' : '❌'} |`;
        }),
      '',
      '## 说明',
      '',
      '- 节 ID 用完整 ID；`S`=`sacn5-chapters-SACN5-37`、`I`=`iris-IRIS-DOG-Treatment-Recommendations-may-2026`、`G`=`iris-IRIS-staging-guidelines-2026`、`P`=`iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g`、`A`=`aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines`。',
      '- 这是「图书馆」验收，不是临床答案验收：通过与否只看 Agent 能不能找到该看的原文/表，不看结论对错。',
      '- 负样本要求「无节也无表」：只返回表格也算有证据（spec 附录 A 的「未覆盖」语义）。',
      '- 退出码由本节 9 条指标共同决定：任一不过 → `process.exitCode = 1`。',
      '',
    );

    const markdown = lines.join('\n');
    if (options.write) {
      writeFileSync(resolve(OUTPUT_DIR, 'library-evaluation.md'), markdown);
    }

    const json = {
      generatedAt: generatedAt.toISOString(),
      questionsFile,
      written: options.write,
      judge:
        'spec v1.1 附录 A（前 3 节命中 / 禁止节 / 负样本 no_match 或 0 节 0 表 / 表格命中 + 按检索 K 打开）',
      tool: "executeTool('search_knowledge_library', { query, species, stage, topics, limit: 5 })；表格题再 executeTool('open_knowledge', { citationId })",
      thresholds: LIBRARY_THRESHOLDS,
      checks,
      exitCode,
      coreTables: {
        passed: coreTablePassed,
        total: coreTables.length,
        results: coreTables,
      },
      timing: { p50, p95, max },
      summary: {
        overall,
        total: runs.length,
        stage3: { passed: stage3Passed, total: stage3Runs.length },
        table: tableStats,
        zh: zhStats,
        negative: negativeStats,
        adversarial: adversarialStats,
      },
      results: runs,
    };
    if (options.write) {
      writeFileSync(
        resolve(OUTPUT_DIR, 'library-evaluation.json'),
        JSON.stringify(json, null, 2),
      );
    }

    console.log('');
    console.log(
      `分类：整体 ${overall}/${runs.length}；Stage 3 ${stage3Passed}/${stage3Runs.length}；表格 ${tableStats.passed}/${tableStats.total}；中文 ${zhStats.passed}/${zhStats.total}；负样本 ${negativeStats.passed}/${negativeStats.total}；对抗 ${adversarialStats.passed}/${adversarialStats.total}`,
    );
    console.log(`耗时：p50 ${p50}ms；p95 ${p95}ms；max ${max}ms`);
    console.log(
      `核心表：${coreTables
        .map((table) => `${table.tableId}${table.ok ? '✔' : '✘'}`)
        .join(' ')}（${coreTablePassed}/${coreTables.length}）`,
    );
    console.log(
      exitCode === 0 ? '阶段出口：全部达标' : '阶段出口：未达标（exitCode=1）',
    );
    if (options.write) {
      console.log(
        `报告：${resolve(OUTPUT_DIR, 'library-evaluation.md')}、${resolve(OUTPUT_DIR, 'library-evaluation.json')}`,
      );
    } else {
      console.log(`--no-write：未写入报告（题集 ${questionsFile}）`);
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
