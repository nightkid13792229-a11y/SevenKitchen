/**
 * 26 题回归评估（走 Agent 工具层，spec v1.1 §8 / 附录 A）。
 *
 * 与旧的 `evaluate-ckd-routing.ts` 的区别：这里调 `executeTool('search_knowledge_library')`，
 * 判分的是模型真正看到的东西（节分组、citationId、表格摘要），不是裸服务。
 *
 * 用法：`npm run kb:eval`（需要 `.env` 里的 DATABASE_URL）
 *       `npm run kb:eval -- --questions <其它题集.json>`（换题集做对照）
 * 产物：`docs/knowledge-base/ckd-structure/library-evaluation.md` + `.json`
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { KnowledgeLibraryService } from '../../src/application/knowledge-base/knowledge-library.service';
import { SourceLayerService } from '../../src/application/knowledge-base/source-layer.service';
import { CitationRegistry } from '../../src/application/recipe-designer/agent/citation-registry';
import {
  executeTool,
  type ToolExecutionContext,
} from '../../src/application/recipe-designer/agent/tools';
import {
  judgeQuestion,
  type QuestionCategory,
  type QuestionSpec,
} from '../../src/application/knowledge-base/library-eval';

/** 阶段出口阈值（spec §8）。 */
const THRESHOLDS = {
  overall: 21,
  stage3: 1,
  table: 2,
  zh: 5,
  negative: 4,
  adversarial: 4,
} as const;

/** Stage 3 硬指标的那一题（spec 附录 A Q10；Q11 中文题另计入中文）。 */
const STAGE3_QUESTION_IDS = ['stage3'];

/** 5 组核心表（spec §7.5；T0253=37-1、T0497=37-9、T0260/61=37-11/12、T0025/26=AAHA 表 8）。 */
const CORE_TABLE_IDS = ['T0253', 'T0497', 'T0260', 'T0261', 'T0025', 'T0026'];

const DEFAULT_QUESTIONS_PATH = resolve(
  __dirname,
  '../../../docs/knowledge-base/ckd-structure/library-questions.json',
);
const OUTPUT_DIR = resolve(__dirname, '../../../docs/knowledge-base/ckd-structure');

/** `--questions <path>`：换题集做对照（默认用仓库里的 26 题）。 */
function questionsPath(argv: string[]): string {
  const index = argv.findIndex((item) => item === '--questions');
  const value = index >= 0 ? String(argv[index + 1] ?? '').trim() : '';
  return value ? resolve(process.cwd(), value) : DEFAULT_QUESTIONS_PATH;
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
  /** 表格题的 open_knowledge 校验结果。 */
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
  let exitCode = 0;
  try {
    const library = new KnowledgeLibraryService(prisma as any);
    const sourceLayer = new SourceLayerService(prisma as any);
    const payload = JSON.parse(readFileSync(questionsPath(process.argv.slice(2)), 'utf8')) as {
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
          const verdict = judgeQuestion(
            {
              status: data.status,
              sections: data.sections,
              tables: data.tables,
            },
            spec,
          );
          // 表格题：再调 open_knowledge 证明「打开后能拿全文 + K 号」。
          const opened: OpenCheck[] = [];
          for (const tableId of spec.expectedTables ?? []) {
            opened.push(await checkOpenTable(tableId, library, sourceLayer));
          }
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

    // 6 张核心表：独立上下文逐张打开。
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

    const checks = [
      {
        name: '整体',
        actual: `${overall}/${runs.length}`,
        target: `≥${THRESHOLDS.overall}/${runs.length}`,
        passed: overall >= THRESHOLDS.overall,
      },
      {
        name: 'Stage 3',
        actual: `${stage3Passed}/${stage3Runs.length}`,
        target: `${THRESHOLDS.stage3}/${stage3Runs.length}`,
        passed: stage3Runs.length > 0 && stage3Passed === stage3Runs.length,
      },
      {
        name: '表格',
        actual: `${tableStats.passed}/${tableStats.total}`,
        target: `${THRESHOLDS.table}/${tableStats.total}`,
        passed: tableStats.passed >= THRESHOLDS.table,
      },
      {
        name: '中文',
        actual: `${zhStats.passed}/${zhStats.total}`,
        target: `≥${THRESHOLDS.zh}/${zhStats.total}`,
        passed: zhStats.passed >= THRESHOLDS.zh,
      },
      {
        name: '负样本',
        actual: `${negativeStats.passed}/${negativeStats.total}`,
        target: `${THRESHOLDS.negative}/${negativeStats.total}`,
        passed: negativeStats.passed === negativeStats.total,
      },
      {
        name: '对抗',
        actual: `${adversarialStats.passed}/${adversarialStats.total}`,
        target: `${THRESHOLDS.adversarial}/${adversarialStats.total}`,
        passed: adversarialStats.passed === adversarialStats.total,
      },
    ];
    const coreTablePassed = coreTables.filter((table) => table.ok).length;
    if (checks.some((check) => !check.passed)) exitCode = 1;

    const generatedAt = new Date();
    const lines: string[] = [
      '# CKD 知识库 26 题回归结果（自动生成）',
      '',
      `> 生成时间：${shortDate(generatedAt)}　|　题集：\`docs/knowledge-base/ckd-structure/library-questions.json\`　|　脚本：\`backend/scripts/knowledge-base/evaluate-library.ts\``,
      '>',
      '> 走 Agent 工具层：每题一个全新的 `CitationRegistry`，调 `executeTool(\'search_knowledge_library\', { query, species, stage, topics, limit: 5 })`。',
      '> 判分：spec v1.1 附录 A —— 前 3 节含任一期望节即通过；前 3 节出现禁止节即不通过；负样本要求 `no_match` 或 0 节；表格题要求表命中且 `open_knowledge` 能打开。',
      '',
      '## 阶段出口',
      '',
      '| 指标 | 实际 | 目标 | 结果 |',
      '|---|---|---|---|',
      ...checks.map(
        (check) =>
          `| ${check.name} | ${check.actual} | ${check.target} | ${check.passed ? '通过' : '未通过'} |`,
      ),
      `| 核心表可打开 | ${coreTablePassed}/${coreTables.length} | ${CORE_TABLE_IDS.length}/${CORE_TABLE_IDS.length} | ${coreTablePassed === CORE_TABLE_IDS.length ? '通过' : '未通过'} |`,
      '',
      '## 耗时（单次工具调用，含检索 + 表格视图 + 引用登记）',
      '',
      `- p50：${p50}ms　p95：${p95}ms　max：${max}ms（目标 p95 <300ms、单次 <1s）`,
      '',
      '## 6 张核心表',
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
          ? `<br>open：${run.opened
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
      '- 负样本若返回表格，报告也在「表格」列列出；负样本判分只看节（spec 附录 A）。',
      '',
    );

    writeFileSync(resolve(OUTPUT_DIR, 'library-evaluation.md'), lines.join('\n'));

    const json = {
      generatedAt: generatedAt.toISOString(),
      questionsFile: 'docs/knowledge-base/ckd-structure/library-questions.json',
      judge: 'spec v1.1 附录 A（前 3 节命中 / 禁止节 / 负样本 no_match / 表格命中 + open）',
      tool: "executeTool('search_knowledge_library', { query, species, stage, topics, limit: 5 })",
      thresholds: THRESHOLDS,
      checks,
      coreTables: { passed: coreTablePassed, total: coreTables.length, results: coreTables },
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
    writeFileSync(resolve(OUTPUT_DIR, 'library-evaluation.json'), JSON.stringify(json, null, 2));

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
    console.log(
      `报告：${resolve(OUTPUT_DIR, 'library-evaluation.md')}、${resolve(OUTPUT_DIR, 'library-evaluation.json')}`,
    );
  } finally {
    await prisma.$disconnect();
  }
  process.exitCode = exitCode;
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
