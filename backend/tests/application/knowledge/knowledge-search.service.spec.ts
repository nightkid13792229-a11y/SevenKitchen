import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { KnowledgeSearchService } from '../../../src/application/knowledge/knowledge-search.service';
import { KnowledgeLibraryService } from '../../../src/application/knowledge-base/knowledge-library.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 补剂 Agent 的知识检索（`chunks.jsonl` 已退休，改查 `source_paragraph`）。
 *
 * 两层证据：
 * 1. 单元：注入假的 Prisma/Library，钉住字段映射、600 字截断、默认条数、
 *    空查询、以及「不传 documentIds（补剂查全库）」；
 * 2. 真实数据库：zinc / copper / bioavailability 三个查询必须真的召回原文——
 *    这是模型「自己去查资料」的工具，召不回来后面所有判断都是空中楼阁。
 *    没有可用数据库就整体 skip，**不拿假数据冒充真实召回**。
 */
function passage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    text: 'Zinc sulfate is a highly bioavailable form of zinc for dogs.',
    truncated: false,
    sourceId: 'NRC',
    sourceName: 'NRC',
    documentId: 'doc-zinc',
    documentTitle: 'NRC Nutrient Requirements',
    sectionId: 'sec-1',
    sectionTitle: 'Zinc',
    pageStart: 10,
    pageEnd: 10,
    score: 12.345,
    ...overrides
  };
}

function unitService(passages: unknown[] = [passage()], count = 1) {
  const library = { search: jest.fn().mockResolvedValue(passages) };
  const prisma = { sourceParagraph: { count: jest.fn().mockResolvedValue(count) } };
  return {
    library,
    prisma,
    service: new KnowledgeSearchService(prisma as never, library as never)
  };
}

describe('KnowledgeSearchService（数据库映射）', () => {
  it('把检索段落映射成 KnowledgeHit', async () => {
    const { service } = unitService();
    const hits = await service.search('zinc sulfate bioavailability', 4);

    expect(hits).toEqual([
      {
        chunkId: 'p1',
        docId: 'doc-zinc',
        text: 'Zinc sulfate is a highly bioavailable form of zinc for dogs.',
        score: 12.345
      }
    ]);
  });

  it('不传 documentIds：补剂查全库', async () => {
    const { library, service } = unitService();
    await service.search('zinc sulfate bioavailability', 4);

    expect(library.search).toHaveBeenCalledTimes(1);
    const [query, options] = library.search.mock.calls[0];
    expect(query).toBe('zinc sulfate bioavailability');
    expect(options).toEqual({ limit: 4 });
    expect(options).not.toHaveProperty('documentIds');
  });

  it('不传 limit 时默认 4 条', async () => {
    const { library, service } = unitService();
    await service.search('zinc');

    expect(library.search).toHaveBeenCalledWith('zinc', { limit: 4 });
  });

  it('text 截断到 600 字', async () => {
    const longText = 'zinc '.repeat(300);
    const { service } = unitService([passage({ text: longText })]);
    const hits = await service.search('zinc');

    expect(hits[0].text.length).toBe(600);
    expect(hits[0].text).toBe(longText.slice(0, 600));
  });

  it('空查询不查库，直接返回空', async () => {
    const { library, service } = unitService();

    await expect(service.search('   ')).resolves.toEqual([]);
    expect(library.search).not.toHaveBeenCalled();
  });
});

describe('KnowledgeSearchService（可用性）', () => {
  it('库里有段落时 isAvailable=true', async () => {
    const { prisma, service } = unitService([], 27_902);

    await expect(service.isAvailable()).resolves.toBe(true);
    expect(prisma.sourceParagraph.count).toHaveBeenCalledTimes(1);
  });

  it('库里没有段落时 isAvailable=false', async () => {
    const { service } = unitService([], 0);

    await expect(service.isAvailable()).resolves.toBe(false);
  });

  it('数据库异常时 isAvailable=false 并记警告', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const prisma = {
      sourceParagraph: { count: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) }
    };
    const service = new KnowledgeSearchService(prisma as never, {} as never);

    try {
      await expect(service.isAvailable()).resolves.toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('知识库数据库不可用或为空'));
    } finally {
      warn.mockRestore();
    }
  });
});

/**
 * describe.skip 必须在收集阶段决定，而 Prisma 查询是异步的；
 * 所以用一个子进程同步问一次「数据库连得上、且 source_paragraph 非空吗」。
 * 没配 DATABASE_URL、连不上、或库是空的都整组跳过——不假装通过；
 * 跳过原因打到 console.warn，避免「显示 PASS 但一条没跑」。
 *
 * cwd 固定到 backend 根（`__dirname` = backend/tests/application/knowledge），
 * 子进程才解析得到 `@prisma/client`，不受执行目录影响。
 */
function databaseSkipReason(): string | null {
  if (!(process.env.DATABASE_URL ?? '').trim()) {
    return '未配置 DATABASE_URL';
  }
  const script = [
    "const { PrismaClient } = require('@prisma/client');",
    'const prisma = new PrismaClient();',
    'prisma.sourceParagraph',
    '  .count()',
    '  .then((count) => process.exit(count > 0 ? 0 : 2))',
    '  .catch(() => process.exit(1));'
  ].join('\n');
  try {
    execFileSync(process.execPath, ['-e', script], {
      cwd: resolve(__dirname, '../../..'),
      env: process.env,
      stdio: 'ignore',
      timeout: 8_000
    });
    return null;
  } catch (error) {
    // 子进程用退出码区分：2 = 连得上但库是空的，其余按连不上处理。
    const status = (error as { status?: number | null }).status;
    return status === 2 ? 'source_paragraph 为空' : '数据库连不上';
  }
}

const skipReason = databaseSkipReason();
if (skipReason) {
  console.warn(`[knowledge-search] 真实数据库召回用例跳过：${skipReason}`);
}

(skipReason === null ? describe : describe.skip)('KnowledgeSearchService（真实数据库召回）', () => {
  const prisma = new PrismaClient();
  const prismaService = prisma as unknown as PrismaService;
  const service = new KnowledgeSearchService(
    prismaService,
    new KnowledgeLibraryService(prismaService)
  );

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('真实库非空时 isAvailable=true', async () => {
    await expect(service.isAvailable()).resolves.toBe(true);
  });

  it('问锌的形态，能召回权威来源且真的含 zinc', async () => {
    const hits = await service.search('zinc sulfate bioavailability chelate', 4);

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => hit.text.toLowerCase().includes('zinc'))).toBe(true);
    expect(hits.some((hit) => /nrc|fediaf|sacn/i.test(hit.docId))).toBe(true);
    for (const hit of hits) {
      expect(hit.chunkId).toBeTruthy();
      expect(hit.docId).toBeTruthy();
    }
  });

  it('问氧化铜，能召回不可作为铜源的依据', async () => {
    const hits = await service.search('copper oxide source of copper', 4);
    const texts = hits.map((hit) => hit.text.toLowerCase()).join(' ');

    expect(hits.length).toBeGreaterThan(0);
    expect(texts).toContain('copper oxide');
  });

  it('每条结果都带出处，text 不超过 600 字', async () => {
    const hits = await service.search('bioavailability', 3);

    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.chunkId).toBeTruthy();
      expect(hit.docId).toBeTruthy();
      expect(hit.text.length).toBeLessThanOrEqual(600);
    }
  });

  it('完全无关的查询返回空', async () => {
    await expect(service.search('zzzzqqqq')).resolves.toEqual([]);
  });
});
