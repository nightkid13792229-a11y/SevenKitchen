/**
 * page-layer JSON → 知识库 v3 四实体（幂等，可重跑）。
 *
 * 用法：
 *   npx ts-node --transpile-only -r tsconfig-paths/register \
 *     scripts/knowledge-v3/import-page-layer.ts [--dir <dir>] [--only <docId>] [--dry-run]
 *
 * 默认目录：`docs/knowledge-base/page-layer`（解析器产物，不进 git，设计 §8.3）。
 *
 * 幂等策略（设计 §8.3）：先按 sourceId 删除旧书（级联删页/块/目录），再整本重建。
 * 每个文件一个事务、超时 120s：5k 块的大文档不能按默认 5s 跑。
 * 页按 200/批、块按 1,000/批 createMany，不把整本文档塞进一次嵌套写。
 */
import { PrismaClient } from '@prisma/client';
import { readdirSync, readFileSync, statSync } from 'fs';
import * as path from 'path';
import { KnowledgeToolError } from '../../src/application/knowledge-v3/knowledge-v3.errors';
import {
  mapPageLayerToRows,
  validatePageLayerFile,
} from '../../src/application/knowledge-v3/page-layer.mapper';

const PAGE_BATCH_SIZE = 200;
const BLOCK_BATCH_SIZE = 1000;
const TRANSACTION_TIMEOUT_MS = 120_000;
const DEFAULT_DIR = path.resolve(
  __dirname,
  '../../../docs/knowledge-base/page-layer',
);

interface CliOptions {
  dir: string;
  only: string | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dir: DEFAULT_DIR, only: null, dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--dir') {
      options.dir = path.resolve(requireValue(argv, index, '--dir'));
      index += 1;
    } else if (arg === '--only') {
      options.only = requireValue(argv, index, '--only');
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      printUsage();
      throw new Error(`未知参数：${arg}`);
    }
  }

  return options;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${flag} 缺少参数值`);
  }
  return value;
}

function printUsage(): void {
  console.log(
    [
      '用法：import-page-layer.ts [--dir <dir>] [--only <docId>] [--dry-run]',
      `  --dir     解析产物目录（默认 ${DEFAULT_DIR}）`,
      '  --only    只导入指定 sourceId',
      '  --dry-run 只校验、不写库',
    ].join('\n'),
  );
}

async function createInBatches<T>(
  rows: T[],
  size: number,
  create: (batch: T[]) => Promise<unknown>,
): Promise<void> {
  for (let index = 0; index < rows.length; index += size) {
    const batch = rows.slice(index, index + size);
    if (batch.length === 0) continue;
    await create(batch);
  }
}

function listLayerFiles(dir: string): string[] {
  if (!statSync(dir).isDirectory()) {
    throw new Error(`--dir 不是目录：${dir}`);
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !name.startsWith('_'))
    .sort();
}

function describeError(error: unknown): string {
  if (error instanceof KnowledgeToolError) {
    // message 已按约定带 code 前缀（如 `INVALID_ARGUMENT: ...`），不重复拼接
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const files = listLayerFiles(options.dir);

  // dry-run 不连库：连 PrismaClient 都不实例化，避免依赖 DATABASE_URL
  const prisma = options.dryRun ? null : new PrismaClient();

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    `${options.dryRun ? '[dry-run] ' : ''}目录 ${options.dir}，共 ${files.length} 个 JSON 文件`,
  );

  try {
    for (const name of files) {
      const filePath = path.join(options.dir, name);

      try {
        const raw: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
        const parsed = validatePageLayerFile(raw);

        if (options.only && parsed.source.id !== options.only) {
          skipped += 1;
          continue;
        }

        const rows = mapPageLayerToRows(parsed);
        const summary =
          `pages=${rows.pages.length} blocks=${rows.blocks.length} toc=${rows.toc.length}`;

        if (!prisma) {
          imported += 1;
          console.log(`[dry-run] ${parsed.source.id} ${summary}（通过校验，未写库）`);
          continue;
        }

        await prisma.$transaction(
          async (tx) => {
            await tx.kbSource.deleteMany({ where: { id: parsed.source.id } });
            await tx.kbSource.create({ data: rows.source });
            await createInBatches(rows.pages, PAGE_BATCH_SIZE, (batch) =>
              tx.kbPage.createMany({ data: batch }),
            );
            await createInBatches(rows.blocks, BLOCK_BATCH_SIZE, (batch) =>
              tx.kbBlock.createMany({ data: batch }),
            );
            if (rows.toc.length > 0) {
              await tx.kbToc.createMany({ data: rows.toc });
            }
          },
          { timeout: TRANSACTION_TIMEOUT_MS },
        );

        imported += 1;
        console.log(`[ok] ${parsed.source.id} ${summary}`);
      } catch (error) {
        failed += 1;
        console.error(`[fail] ${name}: ${describeError(error)}`);
      }
    }
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }

  if (options.only && imported === 0 && failed === 0) {
    console.warn(`[warn] 没有找到 source.id=${options.only} 的 page-layer 文件`);
  }

  console.log(
    `${options.dryRun ? '[dry-run] ' : ''}imported=${imported} skipped=${skipped} failed=${failed}`,
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`[fatal] ${describeError(error)}`);
  process.exitCode = 1;
});
