/**
 * 域内目录/表格检视（全领域上线计划 §3 审计用，只读）。
 *
 * 用途：
 * - 写题集前先看语料里到底有哪些节/表（不猜标题）；
 * - 30 节抽检：按均匀间隔抽 30 节，连正文片段一起打印，人/Agent 判物种与主题。
 *
 * 用法：
 * - `npm run kb:sections -- --domain urology`              列出该域每份文档的节标题
 * - `npm run kb:sections -- --domain urology --tables`     列出该域的表题
 * - `npm run kb:sections -- --domain urology --sample 30`  均匀抽 30 节 + 正文片段
 * - `npm run kb:sections -- --domain urology --doc <id>`   只看一份文档
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { resolveKnowledgeScope } from '../../src/domain/knowledge/knowledge-scope';

interface Options {
  domain: string;
  tables: boolean;
  sample: number;
  doc: string;
  limit: number;
}

function parseArgv(argv: string[]): Options {
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index >= 0 ? String(argv[index + 1] ?? '').trim() : undefined;
  };
  return {
    domain: flag('--domain') ?? 'ckd',
    tables: argv.includes('--tables'),
    sample: Number(flag('--sample') ?? 0) || 0,
    doc: flag('--doc') ?? '',
    limit: Number(flag('--limit') ?? 0) || 0,
  };
}

function snippet(text: string, limit = 150): string {
  const value = text.replace(/\s+/g, ' ').trim();
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

async function main(): Promise<void> {
  const options = parseArgv(process.argv.slice(2));
  const scope = resolveKnowledgeScope([options.domain], {
    allowUnaudited: true,
  });
  const documentIds = options.doc
    ? scope.documentIds.filter((id) => id === options.doc)
    : [...scope.documentIds];
  if (documentIds.length === 0) {
    throw new Error(`域 ${options.domain} 里没有文档 ${options.doc}`);
  }

  const prisma = new PrismaClient();
  try {
    const documents = await prisma.sourceDocument.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, title: true, sourceId: true, pageCount: true },
      orderBy: { id: 'asc' },
    });

    if (options.tables) {
      const tables = await prisma.sourceTable.findMany({
        where: { documentId: { in: documentIds } },
        select: {
          id: true,
          documentId: true,
          caption: true,
          rowCount: true,
          pageNo: true,
        },
        orderBy: { id: 'asc' },
      });
      console.log(`域 ${options.domain}：${tables.length} 张表`);
      for (const table of tables) {
        console.log(
          `${table.id} | ${table.documentId} | p${table.pageNo ?? '-'} | ${table.rowCount} 行 | ${snippet(table.caption, 90)}`,
        );
      }
      return;
    }

    if (options.sample > 0) {
      const sections = await prisma.sourceSection.findMany({
        where: {
          documentId: { in: documentIds },
          title: { not: '(文档开头)' },
        },
        select: { id: true, documentId: true, title: true, pageNo: true },
        orderBy: [{ documentId: 'asc' }, { sortOrder: 'asc' }],
      });
      if (sections.length === 0) throw new Error('该域没有节');
      const step = Math.max(1, Math.floor(sections.length / options.sample));
      const picked: typeof sections = [];
      for (
        let index = 0;
        index < sections.length && picked.length < options.sample;
        index += step
      ) {
        picked.push(sections[index]);
      }
      const paragraphs = await prisma.sourceParagraph.findMany({
        where: { sectionId: { in: picked.map((item) => item.id) } },
        select: { sectionId: true, text: true },
        orderBy: { id: 'asc' },
      });
      const firstBySection = new Map<string, string>();
      for (const paragraph of paragraphs) {
        if (!firstBySection.has(paragraph.sectionId)) {
          firstBySection.set(paragraph.sectionId, paragraph.text);
        }
      }
      console.log(
        `域 ${options.domain}：共 ${sections.length} 节，均匀抽 ${picked.length} 节`,
      );
      picked.forEach((section, index) => {
        console.log(
          `\n[${index + 1}] ${section.id} | p${section.pageNo ?? '-'} | ${snippet(section.title, 90)}`,
        );
        console.log(`    ${snippet(firstBySection.get(section.id) ?? '（无正文）')}`);
      });
      return;
    }

    const sections = await prisma.sourceSection.findMany({
      where: {
        documentId: { in: documentIds },
        title: { not: '(文档开头)' },
      },
      select: {
        id: true,
        documentId: true,
        title: true,
        pageNo: true,
        sortOrder: true,
      },
      orderBy: [{ documentId: 'asc' }, { sortOrder: 'asc' }],
    });
    const byDocument = new Map<string, typeof sections>();
    for (const section of sections) {
      const list = byDocument.get(section.documentId) ?? [];
      list.push(section);
      byDocument.set(section.documentId, list);
    }
    for (const document of documents) {
      const list = byDocument.get(document.id) ?? [];
      console.log(
        `\n=== ${document.id} | ${document.sourceId} | ${document.pageCount ?? '?'}p | ${list.length} 节`,
      );
      const limit = options.limit > 0 ? options.limit : list.length;
      for (const section of list.slice(0, limit)) {
        console.log(
          `  ${section.id} | p${section.pageNo ?? '-'} | ${snippet(section.title, 100)}`,
        );
      }
      if (limit < list.length) {
        console.log(`  …还有 ${list.length - limit} 节`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`✗ ${(error as Error).message}`);
  process.exitCode = 1;
});
