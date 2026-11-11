/**
 * 知识库 v3 真实库冒烟（Task 7；Task 11 有数据后跑）。
 *
 * 用法：
 *   cd backend
 *   npm run kb:v3:smoke            # 读 DATABASE_URL 指向的真实库
 *   npm run kb:v3:smoke -- --help  # 只看用法，不连库
 *
 * 不启动 Nest：用 PrismaClient 直接构造 3 个数据服务 + 网关。
 * 报告写到**仓库根**下的 `docs/knowledge-base/eval/kb-v3-smoke.md`
 * （用 `git rev-parse --show-toplevel` 定位，避免落到 backend/docs）。
 *
 * 只验证“页是原子单位”这条能力：文档数、目录、找页、按页读、页图、续读、
 * 负样本 0 命中、无文字层页可读、越界错误、find 延迟。
 * 不调用模型，不判断知识库是否覆盖。
 */
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { KnowledgeCatalogService } from '../../src/application/knowledge-v3/knowledge-catalog.service';
import { KnowledgeFindService } from '../../src/application/knowledge-v3/knowledge-find.service';
import { KnowledgeGatewayService } from '../../src/application/knowledge-v3/knowledge-gateway.service';
import { KnowledgeReadService } from '../../src/application/knowledge-v3/knowledge-read.service';
import { PageImageService } from '../../src/application/knowledge-v3/page-image.service';
import type {
  KbCatalogResult,
  KbReadResult,
} from '../../src/application/knowledge-v3/knowledge-v3.types';
import type { PrismaService } from '../../src/infrastructure/prisma.service';

const DOC_ID = 'sacn5-chapters-SACN5-37';
const MIN_DOCUMENTS = 159;
const PERF_ITERATIONS = 20;
const PERF_P95_LIMIT_MS = 300;

interface StepResult {
  step: string;
  ok: boolean;
  detail: string;
}

const steps: StepResult[] = [];
let failedSteps = 0;

function printUsage(): void {
  console.log(
    [
      '用法：ts-node -r tsconfig-paths/register scripts/knowledge-v3/smoke.ts [--help]',
      '',
      '读真实库跑知识库 v3 冒烟，并写 docs/knowledge-base/eval/kb-v3-smoke.md。',
      '需要的环境变量：DATABASE_URL、KB_PAGE_IMAGE_ROOT（页图目录）。',
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

  console.log('知识库 v3 冒烟：读真实库，不调用模型');
  console.log(
    `DATABASE_URL=${maskDatabaseUrl(process.env.DATABASE_URL)} KB_PAGE_IMAGE_ROOT=${
      process.env.KB_PAGE_IMAGE_ROOT ?? '(未设置，用默认 ../docs/knowledge-base/page-images，相对 backend cwd)'
    }`,
  );

  const prisma = new PrismaClient();
  try {
    const db = prisma as unknown as PrismaService;
    const images = new PageImageService(db);
    const gateway = new KnowledgeGatewayService(
      new KnowledgeCatalogService(db),
      new KnowledgeFindService(db),
      new KnowledgeReadService(db, images),
    );

    let catalogAll: KbCatalogResult | null = null;
    let knownRead: KbReadResult | null = null;

    await runStep('catalog 文档数', async () => {
      const result = await gateway.catalog({});
      catalogAll = result;
      assert(
        result.sources.length >= MIN_DOCUMENTS,
        `期望文档数 ≥ ${MIN_DOCUMENTS}，实际 ${result.sources.length}`,
      );
      return `文档数 ${result.sources.length}（集合 ${countCollections(result)} 个）`;
    });

    await runStep('SACN5-37 目录', async () => {
      const result = await gateway.catalog({ documentId: DOC_ID });
      const toc = result.toc ?? [];
      assert(toc.length > 0, `${DOC_ID} 没有目录条目`);
      const first = requireValue(toc[0], `${DOC_ID} 目录为空`);
      return `目录 ${toc.length} 条；首条 "${first.title}" p${first.pageFrom}–${first.pageTo}`;
    });

    await runStep('find phosphorus 命中 17–22 节', async () => {
      const result = await gateway.find({
        query: 'phosphorus',
        documentIds: [DOC_ID],
        limit: 5,
      });
      assert(result.hits.length > 0, 'phosphorus 0 命中');
      const top = requireValue(result.hits[0], 'phosphorus 0 命中');
      // 不强制“第一命中就是章节首页”：p24 的磷推荐量表提到 phosphorus 25 次，
      // 排第一是索引的正常行为（词频排序）。这里只要求前 5 条覆盖本次要读的
      // 17–22 节，随后仍按 p17–21 读页并检查文本/页图。
      const topFive = result.hits.slice(0, 5).map((hit) => hit.pageNo);
      assert(
        topFive.some((pageNo) => pageNo >= 17 && pageNo <= 22),
        `前 5 条命中页 ${topFive.join(',')} 都不在 17–22`,
      );
      return `hits=${result.hits.length} top=p${top.pageNo} score=${top.score.toFixed(3)}；前 5 页=${topFive.join(',')}`;
    });

    await runStep('read p17–21：5 页 / 锚点 / 页图 / base64 / 文本', async () => {
      const result = await gateway.read({
        documentId: DOC_ID,
        pageFrom: 17,
        pageTo: 21,
        includeImages: true,
        budgetTokens: 30_000,
      });
      knownRead = result;

      assert(result.pages.length === 5, `期望 5 页，实际 ${result.pages.length}`);
      const anchors = result.pages.map((page) => page.anchor);
      assert(
        anchors[0] === `${DOC_ID}/p17`,
        `首锚点应为 ${DOC_ID}/p17，实际 ${anchors[0]}`,
      );

      for (const page of result.pages) {
        requireValue(page.imagePath, `p${page.pageNo} 缺 imagePath`);
        const base64 = requireValue(
          page.imageBase64,
          `p${page.pageNo} 缺 imageBase64`,
        );
        assert(
          base64.startsWith('/9j/'),
          `p${page.pageNo} 的 base64 不是 JPEG（应以 /9j/ 开头）`,
        );
      }

      const p17 = requireValue(
        result.pages.find((page) => page.pageNo === 17),
        '结果里没有 p17',
      );
      assert(
        /Phosphorus/i.test(p17.text) || /Table 37-9/i.test(p17.text),
        'p17 文本既不含 Phosphorus 也不含 Table 37-9',
      );

      const tablePages = result.pages
        .filter((page) => page.blocks.some((block) => block.kind === 'table'))
        .map((page) => page.pageNo);
      const tableNote =
        tablePages.length > 0
          ? `表块页=${tablePages.join(',')}`
          : '表块未检测到（页图仍在，不算失败）';
      return `5 页，锚点 ${anchors[0]}..${anchors[4]}，${tableNote}`;
    });

    await runStep('nextCursor 续读', async () => {
      const firstCursor = knownRead?.nextCursor ?? null;
      let cursor = firstCursor;
      if (cursor === null) {
        // 5 页都装进预算时 nextCursor 为 null；用最小预算强制产生游标再续读。
        const first = await gateway.read({
          documentId: DOC_ID,
          pageFrom: 17,
          pageTo: 21,
          includeImages: false,
          budgetTokens: 1,
        });
        const forced = requireValue(
          first.nextCursor,
          '小预算读取没有返回 nextCursor',
        );
        cursor = forced;
      }

      const continued = await gateway.read({ documentId: DOC_ID, cursor });
      assert(continued.pages.length > 0, '续读返回 0 页');
      const firstPage = continued.pages[0].pageNo;
      const lastPage = continued.pages[continued.pages.length - 1].pageNo;
      return `续读 p${firstPage}–p${lastPage}（${continued.pages.length} 页）`;
    });

    await runStep('负样本 0 命中且无“未覆盖”字样', async () => {
      const candidates = ['"vitamin K"', 'biotin', 'chromium'];
      for (const query of candidates) {
        const result = await gateway.find({
          query,
          documentIds: [DOC_ID],
        });
        if (result.hits.length > 0) {
          console.log(`[info] 负样本 ${query} 仍有 ${result.hits.length} 命中，换下一个`);
          continue;
        }
        const serialized = JSON.stringify(result);
        assert(
          !/no_match|未覆盖/.test(serialized),
          '0 命中的返回里出现了 no_match / 未覆盖',
        );
        return `${query} → hits=0，searched=${result.searched.documents} 文档 / ${result.searched.pages} 页`;
      }
      throw new Error('3 个负样本都还有命中，需要另选负样本词');
    });

    await runStep('无文字层文档第 1 页可读', async () => {
      const sources = catalogAll?.sources ?? [];
      const candidate = sources.find(
        (source) => !source.hasTextLayer && source.pageCount >= 1,
      );
      if (!candidate) {
        return 'SKIP：本次数据里没有 hasTextLayer=false 的文档';
      }
      const result = await gateway.read({
        documentId: candidate.id,
        pageFrom: 1,
        pageTo: 1,
        includeImages: true,
      });
      assert(result.pages.length === 1, `期望 1 页，实际 ${result.pages.length}`);
      const page = result.pages[0];
      const imagePath = requireValue(
        page.imagePath,
        `${candidate.id} p1 缺 imagePath`,
      );
      return `${candidate.id} p1 text=${page.text.length} 字，imagePath=${imagePath}`;
    });

    await runStep('页码 99999 → PAGE_OUT_OF_RANGE', async () => {
      const result = await gateway.execute('kb_read', {
        documentId: DOC_ID,
        pageFrom: 99_999,
        pageTo: 99_999,
      });
      if (result.ok) {
        throw new Error('越界页码竟然读取成功');
      }
      assert(
        result.error.code === 'PAGE_OUT_OF_RANGE',
        `错误码应为 PAGE_OUT_OF_RANGE，实际 ${result.error.code}`,
      );
      return `code=${result.error.code}`;
    });

    await runStep(
      `find ${PERF_ITERATIONS} 次 p50/p95/max（p95 < ${PERF_P95_LIMIT_MS}ms）`,
      async () => {
        const samples: number[] = [];
        for (let index = 0; index < PERF_ITERATIONS; index += 1) {
          const startedAt = performance.now();
          await gateway.find({
            query: 'phosphorus',
            documentIds: [DOC_ID],
            limit: 10,
          });
          samples.push(performance.now() - startedAt);
        }
        samples.sort((a, b) => a - b);
        const p50 = percentile(samples, 0.5);
        const p95 = percentile(samples, 0.95);
        const max = samples[samples.length - 1];
        assert(
          p95 < PERF_P95_LIMIT_MS,
          `p95=${p95.toFixed(1)}ms，未达到 < ${PERF_P95_LIMIT_MS}ms`,
        );
        return `p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms`;
      },
    );
  } finally {
    await prisma.$disconnect();
  }

  const reportPath = writeReport();
  console.log(`\n报告：${reportPath}`);
  console.log(failedSteps === 0 ? '结果：PASS' : `结果：FAIL（${failedSteps} 步失败）`);
  if (failedSteps > 0) {
    process.exitCode = 1;
  }
}

async function runStep(
  step: string,
  run: () => Promise<string>,
): Promise<void> {
  try {
    const detail = await run();
    steps.push({ step, ok: true, detail });
    console.log(`[ok] ${step}: ${detail}`);
  } catch (error) {
    const detail = describeError(error);
    failedSteps += 1;
    steps.push({ step, ok: false, detail });
    console.error(`[fail] ${step}: ${detail}`);
  }
}

function writeReport(): string {
  const root = repoRoot();
  const outputDir = path.join(root, 'docs/knowledge-base/eval');
  const outputPath = path.join(outputDir, 'kb-v3-smoke.md');

  const lines = [
    '# 知识库 v3 冒烟报告',
    '',
    `- 生成时间：${new Date().toISOString()}`,
    `- 仓库：\`${root}\``,
    `- 目标文档：\`${DOC_ID}\``,
    `- \`KB_PAGE_IMAGE_ROOT\`：\`${
      process.env.KB_PAGE_IMAGE_ROOT ??
      '(未设置，默认 ../docs/knowledge-base/page-images，相对 backend cwd)'
    }\``,
    `- 结论：${failedSteps === 0 ? 'PASS' : `FAIL（${failedSteps} 步失败）`}`,
    '',
    '| 步骤 | 结果 | 详情 |',
    '| --- | --- | --- |',
    ...steps.map(
      (step) =>
        `| ${escapeCell(step.step)} | ${step.ok ? 'PASS' : 'FAIL'} | ${escapeCell(step.detail)} |`,
    ),
    '',
    '> 本脚本读真实库、不调用模型；表块检测漏了不算失败（页图仍在）；',
    '> 负样本 0 命中只表示“这组词没命中”，不表示“知识库未覆盖”该主题。',
    '',
  ];

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, lines.join('\n'), 'utf8');
  return outputPath;
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

function countCollections(result: KbCatalogResult): number {
  return new Set(result.sources.map((source) => source.collection)).size;
}

function percentile(sortedSamples: number[], ratio: number): number {
  if (sortedSamples.length === 0) return 0;
  const index = Math.min(
    sortedSamples.length - 1,
    Math.max(0, Math.ceil(ratio * sortedSamples.length) - 1),
  );
  return sortedSamples[index];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** 断言函数不会窄化属性表达式，用返回值拿非空值。 */
function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
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
