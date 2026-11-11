/**
 * 知识库 v3 结构基准：固定流程的 reference caller（**不是模型**）。
 *
 * 用法：
 *   cd backend
 *   npm run kb:v3:bench            # 读 DATABASE_URL 指向的真实库
 *   npm run kb:v3:bench -- --help  # 只看用法，不连库
 *
 * 本脚本只度量“接口需要几次调用、一次返回几页、首个命中页在哪、估算 token、
 * 耗时”，用固定顺序的 caller 直接调用 3 个动作。它证明接口能力，
 * **不证明模型会这样调，也不是模型的调用次数**。Agent A/B 必须由调用方
 * 冻结模型/提示词/业务工具后另行测试（设计 §9）。
 *
 * 输出：仓库根下 `docs/knowledge-base/eval/kb-v3-call-benchmark.md`
 * （用 `git rev-parse --show-toplevel` 定位，避免落到 backend/docs）。
 */
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { estimateTokens } from '../../src/application/knowledge-v3/knowledge-v3.anchors';
import { KnowledgeCatalogService } from '../../src/application/knowledge-v3/knowledge-catalog.service';
import { KnowledgeFindService } from '../../src/application/knowledge-v3/knowledge-find.service';
import { KnowledgeGatewayService } from '../../src/application/knowledge-v3/knowledge-gateway.service';
import { KnowledgeReadService } from '../../src/application/knowledge-v3/knowledge-read.service';
import { PageImageService } from '../../src/application/knowledge-v3/page-image.service';
import type {
  KbCatalogResult,
  KbFindResult,
  KbReadResult,
} from '../../src/application/knowledge-v3/knowledge-v3.types';
import type { PrismaService } from '../../src/infrastructure/prisma.service';

const DOC_ID = 'sacn5-chapters-SACN5-37';
const REFERENCE_NOTE = 'reference caller, not model';

interface BenchCall {
  tool: string;
  /** false = 会话 setup（如 catalog），不计入每题调用次数 */
  counted: boolean;
  ok: boolean;
  ms: number;
}

interface BenchOutcome {
  pages: number;
  tokens: number;
  firstHitPage: number | null;
  note: string;
}

interface QuestionContext {
  gateway: KnowledgeGatewayService;
  imageDocumentId: string | null;
  /** 无文字层文档的页数；1 页的图片型文档不能读 1..2（会 PAGE_OUT_OF_RANGE）。 */
  imageDocumentPageCount: number | null;
}

interface Question {
  id: string;
  title: string;
  target: string;
  run: (
    context: QuestionContext,
    tracker: CallTracker,
  ) => Promise<BenchOutcome>;
}

interface ReportRow {
  question: Question;
  calls: BenchCall[];
  pages: number;
  tokens: number;
  firstHitPage: number | null;
  ms: number;
  ok: boolean;
  detail: string;
}

/** 按顺序记录每次 KB 调用；`counted=false` 的 catalog 只算会话 setup。 */
class CallTracker {
  readonly calls: BenchCall[] = [];

  constructor(private readonly gateway: KnowledgeGatewayService) {}

  async call<T>(tool: string, args: unknown, counted = true): Promise<T> {
    const startedAt = performance.now();
    const result = await this.gateway.execute(tool, args);
    this.calls.push({
      tool,
      counted,
      ok: result.ok,
      ms: performance.now() - startedAt,
    });
    if (!result.ok) {
      throw new Error(`${tool} 返回 ${result.error.code}：${result.error.message}`);
    }
    return result.data as T;
  }

  get countedCalls(): number {
    return this.calls.filter((call) => call.counted).length;
  }

  get sequence(): string {
    if (this.calls.length === 0) return '（无调用）';
    return this.calls
      .map((call) => (call.counted ? call.tool : `${call.tool}(setup)`))
      .join(' → ');
  }
}

const QUESTIONS: Question[] = [
  {
    id: 'Q1',
    title: '已知文档：SACN5-37 表 37-9 附近',
    target: 'read 1 次',
    run: async (_context, tracker) => {
      const result = await tracker.call<KbReadResult>('kb_read', {
        documentId: DOC_ID,
        pageFrom: 17,
        pageTo: 21,
        includeImages: false,
      });
      return {
        pages: result.pages.length,
        tokens: textTokens(result),
        firstHitPage: result.pages[0]?.pageNo ?? null,
        note: '页码取自题面，直接读',
      };
    },
  },
  {
    id: 'Q2',
    title: '已知问题、不知道在哪：磷需要量',
    target: 'find + read = 2 次',
    run: async (_context, tracker) => {
      const found = await tracker.call<KbFindResult>('kb_find', {
        query: 'phosphorus',
        documentIds: [DOC_ID],
        limit: 10,
      });
      const top = found.hits[0];
      if (!top) throw new Error('phosphorus 0 命中');
      const from = Math.max(1, top.pageNo);
      const result = await tracker.call<KbReadResult>('kb_read', {
        documentId: top.documentId,
        pageFrom: from,
        pageTo: from + 4,
        includeImages: false,
      });
      return {
        pages: result.pages.length,
        tokens: textTokens(result) + snippetTokens(found),
        firstHitPage: top.pageNo,
        note: `find top=p${top.pageNo}`,
      };
    },
  },
  {
    id: 'Q3',
    title: '表题：推荐量/表格',
    target: 'find + read = 2 次',
    run: async (_context, tracker) => {
      const found = await tracker.call<KbFindResult>('kb_find', {
        query: 'recommended allowance',
        documentIds: [DOC_ID],
        limit: 10,
      });
      const top = found.hits[0];
      if (!top) throw new Error('recommended allowance 0 命中');
      const result = await tracker.call<KbReadResult>('kb_read', {
        documentId: top.documentId,
        pageFrom: top.pageNo,
        pageTo: top.pageNo + 2,
        includeImages: true,
      });
      return {
        pages: result.pages.length,
        tokens: textTokens(result) + snippetTokens(found),
        firstHitPage: top.pageNo,
        note: `find top=p${top.pageNo}；表在页图里，图片 token 未计入`,
      };
    },
  },
  {
    id: 'Q4',
    title: '图片型：无文字层文档',
    target: 'read 1 次',
    run: async (context, tracker) => {
      const documentId = context.imageDocumentId ?? DOC_ID;
      const lastPage =
        context.imageDocumentId === null
          ? 2
          : Math.min(2, context.imageDocumentPageCount ?? 1);
      const result = await tracker.call<KbReadResult>('kb_read', {
        documentId,
        pageFrom: 1,
        pageTo: lastPage,
        includeImages: true,
      });
      return {
        pages: result.pages.length,
        tokens: textTokens(result),
        firstHitPage: result.pages[0]?.pageNo ?? null,
        note:
          context.imageDocumentId === null
            ? '未找到无文字层文档，退回 SACN5-37 第 1 页'
            : `${documentId} 无文字层，页图即内容；图片 token 未计入`,
      };
    },
  },
  {
    id: 'Q5',
    title: '负样本：biotin（预期 0 命中）',
    target: 'find 1 次',
    run: async (_context, tracker) => {
      const found = await tracker.call<KbFindResult>('kb_find', {
        query: 'biotin',
        documentIds: [DOC_ID],
        limit: 10,
      });
      return {
        pages: 0,
        tokens: snippetTokens(found),
        firstHitPage: found.hits[0]?.pageNo ?? null,
        note:
          found.hits.length === 0
            ? '0 命中；这只说明该词没命中，不判断知识库是否覆盖'
            : `仍有 ${found.hits.length} 命中`,
      };
    },
  },
  {
    id: 'Q6',
    title: '整章：目录定位后按 tocId 读',
    target: 'catalog(setup) + read = 1 次',
    run: async (_context, tracker) => {
      const catalog = await tracker.call<KbCatalogResult>(
        'kb_catalog',
        { documentId: DOC_ID },
        false,
      );
      const toc = catalog.toc ?? [];
      const entry = toc[0];
      if (!entry) throw new Error('SACN5-37 目录为空');
      const result = await tracker.call<KbReadResult>('kb_read', {
        documentId: DOC_ID,
        tocId: entry.id,
        includeImages: false,
      });
      return {
        pages: result.pages.length,
        tokens: textTokens(result),
        firstHitPage: entry.pageFrom,
        note: `toc "${entry.title}" p${entry.pageFrom}–${entry.pageTo}；默认预算可截断`,
      };
    },
  },
];

function printUsage(): void {
  console.log(
    [
      '用法：ts-node -r tsconfig-paths/register scripts/knowledge-v3/benchmark-calls.ts [--help]',
      '',
      '结构基准 / reference caller，不是模型调用次数。',
      '读真实库跑 6 道固定题，写 docs/knowledge-base/eval/kb-v3-call-benchmark.md。',
      '需要的环境变量：DATABASE_URL、KB_PAGE_IMAGE_ROOT（图片题用）。',
      '',
      '  --help, -h  只打印用法，不连库',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  console.log(`知识库 v3 结构基准：${REFERENCE_NOTE}`);
  console.log(
    `DATABASE_URL=${maskDatabaseUrl(process.env.DATABASE_URL)} KB_PAGE_IMAGE_ROOT=${
      process.env.KB_PAGE_IMAGE_ROOT ?? '(未设置，用默认 ../docs/knowledge-base/page-images，相对 backend cwd)'
    }`,
  );

  const prisma = new PrismaClient();
  const rows: ReportRow[] = [];
  let setupCalls = 1;

  try {
    const db = prisma as unknown as PrismaService;
    const images = new PageImageService(db);
    const gateway = new KnowledgeGatewayService(
      new KnowledgeCatalogService(db),
      new KnowledgeFindService(db),
      new KnowledgeReadService(db, images),
    );

    // catalog 是会话 setup：单独记 1 次，不计入任何一题。
    const catalogSetup = await gateway.execute('kb_catalog', {});
    const sources = catalogSetup.ok
      ? ((catalogSetup.data as KbCatalogResult).sources ?? [])
      : [];
    if (!catalogSetup.ok) {
      console.warn(
        `[warn] 会话 setup catalog 失败：${catalogSetup.error.code} ${catalogSetup.error.message}`,
      );
    }
    const imageDocument = sources.find(
      (source) => !source.hasTextLayer && source.pageCount >= 1,
    );
    const context: QuestionContext = {
      gateway,
      imageDocumentId: imageDocument?.id ?? null,
      imageDocumentPageCount: imageDocument?.pageCount ?? null,
    };

    for (const question of QUESTIONS) {
      const tracker = new CallTracker(gateway);
      const startedAt = performance.now();
      try {
        const outcome = await question.run(context, tracker);
        rows.push({
          question,
          calls: tracker.calls,
          pages: outcome.pages,
          tokens: outcome.tokens,
          firstHitPage: outcome.firstHitPage,
          ms: performance.now() - startedAt,
          ok: true,
          detail: outcome.note,
        });
        console.log(
          `[ok] ${question.id} ${question.title} 调用=${tracker.countedCalls} 页数=${outcome.pages}`,
        );
      } catch (error) {
        rows.push({
          question,
          calls: tracker.calls,
          pages: 0,
          tokens: 0,
          firstHitPage: null,
          ms: performance.now() - startedAt,
          ok: false,
          detail: describeError(error),
        });
        console.error(`[fail] ${question.id} ${question.title}: ${describeError(error)}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  const reportPath = writeReport(rows, setupCalls);
  const failed = rows.filter((row) => !row.ok).length;
  console.log(`\n报告：${reportPath}`);
  console.log(
    failed === 0
      ? '结果：6 题完成（结构基准，不代表模型调用次数）'
      : `结果：FAIL（${failed} 题未完成）`,
  );
  if (failed > 0) {
    process.exitCode = 1;
  }
}

function writeReport(rows: ReportRow[], setupCalls: number): string {
  const root = repoRoot();
  const outputDir = path.join(root, 'docs/knowledge-base/eval');
  const outputPath = path.join(outputDir, 'kb-v3-call-benchmark.md');

  const lines = [
    '# 知识库 v3 结构基准 / reference caller，不是模型调用次数',
    '',
    `> ${REFERENCE_NOTE}`,
    '',
    '本报告用固定流程的 reference caller 直接调用 `kb_catalog` / `kb_find` / `kb_read`，',
    '度量“接口需要几次调用、一次返回几页”。它证明接口能力，**不证明模型会这样调**，',
    '也不代表 Agent 的真实模型调用次数；Agent A/B 必须冻结模型/提示词/业务工具后另行测试。',
    '',
    `- 生成时间：${new Date().toISOString()}`,
    `- 仓库：\`${root}\``,
    `- 目标文档：\`${DOC_ID}\``,
    `- 会话 setup：\`kb_catalog\` × ${setupCalls}（不计入每题；Q6 内的 catalog 也不计数）`,
    `- token 估算：\`estimateTokens\` 只算文本；页图 base64 不计`,
    '',
    '| 题 | 场景 | 调用序列 | KB 调用次数 | 页数 | 估算 token（文本） | 首个命中页 | 耗时 ms | 结果 | 备注 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => {
      const sequence = sequenceOf(row.calls);
      const counted = row.calls.filter((call) => call.counted).length;
      return `| ${row.question.id} | ${escapeCell(row.question.title)} | ${escapeCell(sequence)} | ${counted} | ${row.pages} | ${row.tokens} | ${row.firstHitPage ?? '—'} | ${row.ms.toFixed(1)} | ${row.ok ? 'OK' : 'FAIL'} | ${escapeCell(row.detail)} |`;
    }),
    '',
    '## 固定题集（6 题）',
    '',
    '| 题 | 目标调用数 | 固定流程 |',
    '| --- | --- | --- |',
    ...QUESTIONS.map(
      (question) =>
        `| ${question.id} | ${escapeCell(question.target)} | ${escapeCell(question.title)}（${escapeCell(targetDetail(question.id))}） |`,
    ),
    '',
    '> 结构基准的用法：超过 2–3 次先改“页为单位的返回/索引/预算”，',
    '> 不加工具、不改提示词、不加“必须先…”的约束（设计 §9.4）。',
    '',
  ];

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, lines.join('\n'), 'utf8');
  return outputPath;
}

function targetDetail(questionId: string): string {
  switch (questionId) {
    case 'Q1':
      return '页码已知，直接 read';
    case 'Q2':
      return 'find top1 → read 该页起 5 页';
    case 'Q3':
      return 'find 表题 → read 该页起 3 页（带页图）';
    case 'Q4':
      return 'read 无文字层文档第 1–2 页（带页图）';
    case 'Q5':
      return 'find 负样本，0 命中';
    case 'Q6':
      return 'catalog 取目录 → read 第一条 tocId';
    default:
      return '';
  }
}

function sequenceOf(calls: BenchCall[]): string {
  if (calls.length === 0) return '（无调用）';
  return calls
    .map((call) => (call.counted ? call.tool : `${call.tool}(setup)`))
    .join(' → ');
}

function textTokens(result: KbReadResult): number {
  return result.pages.reduce(
    (total, page) => total + estimateTokens(page.text),
    0,
  );
}

function snippetTokens(result: KbFindResult): number {
  return result.hits.reduce(
    (total, hit) => total + estimateTokens(hit.snippet),
    0,
  );
}

function repoRoot(): string {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    throw new Error(
      `无法用 git rev-parse --show-toplevel 定位仓库根：${describeError(error)}`,
    );
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function maskDatabaseUrl(value: string | undefined): string {
  if (!value) return '(未设置)';
  return value.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@');
}

main().catch((error: unknown) => {
  console.error(`[fatal] ${describeError(error)}`);
  process.exitCode = 1;
});
