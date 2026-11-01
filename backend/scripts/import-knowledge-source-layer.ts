/**
 * 导入知识库原文层（幂等，可重跑）。
 *
 * 数据来源：docs/knowledge-base/{source-layer,tables,figure-index.csv,citation-anchors.json}
 * 用法：npx ts-node -r tsconfig-paths/register scripts/import-knowledge-source-layer.ts
 *
 * 策略：整表清空后重建。这些是从原文档派生的数据，没有人工编辑内容，
 * 重跑就是重新生成，不需要增量。
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const DATA_DIR =
  process.env.KB_DATA_DIR ?? path.resolve(__dirname, '../../docs/knowledge-base');

function docId(rel: string): string {
  return rel
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function sourceIdFor(rel: string): string | null {
  if (rel.startsWith('sacn5/')) return 'SACN5';
  if (rel.startsWith('aaha/')) {
    if (rel.includes('2021')) return 'AAHA-2021-NUTRITION';
    if (rel.includes('2014')) return 'AAHA-2014-WEIGHT';
    if (rel.includes('2023-Senior')) return 'AAHA-SENIOR-2023';
    if (rel.includes('2019-Canine-Life')) return 'AAHA-LIFE-STAGE-2019';
    if (rel.includes('2019-Dental')) return 'AAHA-DENTAL-2019';
    if (rel.includes('2022-Canine-Vaccination')) return 'AAHA-VACC-2022';
    return null;
  }
  if (rel.startsWith('acvim/')) return 'ACVIM-CONSENSUS';
  if (rel.startsWith('wsava/nutrition')) return 'WSAVA-NUTRITION';
  if (rel.startsWith('wsava/vaccination')) return 'WSAVA-VACC-2024';
  if (rel.startsWith('wsava/pain')) return 'WSAVA-PAIN-2022';
  if (rel.startsWith('wsava/dental')) return 'WSAVA-DENTAL';
  if (rel.startsWith('wsava/repro')) return 'WSAVA-REPRO';
  if (rel.startsWith('wsava/welfare')) return 'WSAVA-WELFARE';
  if (rel.startsWith('wsava/hereditary')) return 'WSAVA-HEREDITARY';
  if (rel.startsWith('iris/')) return 'IRIS-CKD-2026';
  if (rel.startsWith('fediaf/')) return 'FEDIAF-2025';
  if (rel.startsWith('nrc/')) return 'NRC-2006';
  if (rel.startsWith('merck/')) return 'MERCK-CLINICAL-BIOCHEM';
  if (rel.startsWith('cn-regulation/')) return 'CN-EPIDEMIC-LAW';
  if (rel.startsWith('aspca/')) return 'ASPCA-POISON';
  return null;
}

async function chunked<T>(rows: T[], size: number, fn: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await fn(rows.slice(i, i + size));
  }
}

async function main() {
  const layerDir = path.join(DATA_DIR, 'source-layer');
  const files = fs.readdirSync(layerDir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));

  console.log(`清空原有数据…`);
  await prisma.knowledgeCitationAnchor.deleteMany();
  await prisma.sourceFigure.deleteMany();
  await prisma.sourceTable.deleteMany();
  await prisma.sourceParagraph.deleteMany();
  await prisma.sourceSection.deleteMany();
  await prisma.sourceDocument.deleteMany();

  let nDocs = 0, nSecs = 0, nParas = 0;
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(layerDir, f), 'utf8'));
    const chars = d.paragraphs.reduce((s: number, p: any) => s + p.text.length, 0);
    await prisma.sourceDocument.create({
      data: {
        id: d.docId,
        sourceId: sourceIdFor(d.path),
        title: d.title ?? null,
        path: d.path,
        pageCount: d.pages ?? null,
        charCount: chars,
      },
    });
    nDocs++;

    const secRows = (d.sections ?? []).map((s: any, i: number) => ({
      id: s.id,
      documentId: d.docId,
      title: s.title ?? '',
      pageNo: s.pageNo ?? null,
      sortOrder: i,
    }));
    await chunked(secRows, 500, (b) =>
      prisma.sourceSection.createMany({ data: b as any[] }),
    );
    nSecs += secRows.length;

    const parRows = (d.paragraphs ?? []).map((p: any) => ({
      id: p.id,
      documentId: d.docId,
      sectionId: p.sectionId,
      text: p.text,
      pageStart: p.pageStart ?? null,
      pageEnd: p.pageEnd ?? null,
      charCount: p.text.length,
    }));
    await chunked(parRows, 500, (b) =>
      prisma.sourceParagraph.createMany({ data: b as any[] }),
    );
    nParas += parRows.length;
  }
  console.log(`文档 ${nDocs} / 章节 ${nSecs} / 段落 ${nParas}`);

  // 表格
  const tableDir = path.join(DATA_DIR, 'tables');
  const tIndex = new Map<string, string>();
  const idxCsv = fs.readFileSync(path.join(tableDir, '_index.csv'), 'utf8').replace(/^\uFEFF/, '');
  for (const line of idxCsv.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? [];
    const cols = cells.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
    if (cols.length > 2) tIndex.set(cols[0], cols[1]);
  }
  let nTables = 0;
  for (const f of fs.readdirSync(tableDir).filter((x) => /^T\d+\.json$/.test(x))) {
    const t = JSON.parse(fs.readFileSync(path.join(tableDir, f), 'utf8'));
    const rel = tIndex.get(t.tableId) ?? t.doc ?? '';
    const did = docId(rel);
    const exists = await prisma.sourceDocument.findUnique({ where: { id: did } });
    if (!exists) continue;
    await prisma.sourceTable.create({
      data: {
        id: t.tableId,
        documentId: did,
        pageNo: t.page ?? null,
        caption: t.caption ?? '',
        columns: t.columns ?? [],
        rows: t.rows ?? [],
        verify: t.verify ?? null,
        method: t.method ?? null,
        rowCount: (t.rows ?? []).length,
      },
    });
    nTables++;
  }
  console.log(`表格 ${nTables}`);

  // 图片
  const figCsv = fs.readFileSync(path.join(DATA_DIR, 'figure-index.csv'), 'utf8').replace(/^\uFEFF/, '');
  const figRows = figCsv.split('\n').slice(1).filter((l) => l.trim());
  let nFigs = 0;
  for (const line of figRows) {
    const cols = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? [];
    const c = cols.map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
    const [figId, rel, page, w, h, caption] = c;
    const did = docId(rel ?? '');
    const exists = await prisma.sourceDocument.findUnique({ where: { id: did } });
    if (!exists) continue;
    await prisma.sourceFigure.create({
      data: {
        id: (figId ?? '').slice(0, 200),
        documentId: did,
        pageNo: page ? Number(page) : null,
        path: `docs/knowledge-base/figures/${figId}.jpg`,
        caption: caption || null,
        width: w ? Number(w) : null,
        height: h ? Number(h) : null,
      },
    });
    nFigs++;
  }
  console.log(`图片 ${nFigs}`);

  // 出处锚点
  const anchors = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'citation-anchors.json'), 'utf8'),
  ).filter((a: any) => a.confidence);
  await chunked(anchors, 300, (b) =>
    prisma.knowledgeCitationAnchor.createMany({
      data: b.map((a: any) => ({
        id: `${a.entry}:${a.source ?? ''}:${(a.chapter ?? '').slice(0, 40)}`,
        entryId: a.entry,
        sourceName: a.source ?? null,
        locator: a.chapter ?? null,
        documentId: a.doc ?? null,
        sectionId: a.section ?? null,
        paragraphIds: a.paragraphs ?? [],
        tableIds: a.tableIds ?? [],
        precision: a.precision ?? 'section',
        confidence: a.confidence,
        score: a.score ?? 0,
      })),
    }),
  );
  console.log(`出处锚点 ${anchors.length}`);

  console.log('导入完成。');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
