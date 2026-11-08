import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { KnowledgeLibraryService } from '../../src/application/knowledge-base/knowledge-library.service';
import { CKD_DOCUMENT_IDS } from '../../src/application/knowledge-base/section-catalog.service';

type Question = {
  id: string;
  question: string;
  query?: string;
  species?: 'dog' | 'cat';
  stage?: 1 | 2 | 3 | 4;
  topics?: string[];
  expectedSections?: string[];
  expectNoSource?: boolean;
};

(async () => {
  const prisma = new PrismaClient();
  const service = new KnowledgeLibraryService(prisma as any);
  const path = resolve(__dirname, '../../../docs/knowledge-base/ckd-structure/retrieval-questions.json');
  const payload = JSON.parse(readFileSync(path, 'utf8')) as { questions: Question[] };
  const results = [];
  for (const item of payload.questions) {
    const passages = await service.search(item.query ?? item.question, {
      documentIds: [...CKD_DOCUMENT_IDS],
      species: item.species,
      stage: item.stage,
      topics: item.topics,
      limit: 5,
    });
    const ids = passages.map((passage) => passage.sectionId);
    const expected = new Set(item.expectedSections ?? []);
    const hit3 = expected.size > 0 ? ids.slice(0, 3).some((id) => expected.has(id)) : false;
    const hit5 = expected.size > 0 ? ids.some((id) => expected.has(id)) : false;
    const noSource = item.expectNoSource === true ? ids.length === 0 : false;
    results.push({
      id: item.id,
      question: item.question,
      top3: ids.slice(0, 3),
      hit3: item.expectNoSource ? noSource : hit3,
      hit5,
      noSource,
    });
  }
  const lines = [
    '# CKD 目录路由验收结果（自动生成）',
    '',
    '> 只测知识库目录/检索，不测 Agent；hit3 = 前 3 条段落中有预期章节。',
    '',
    '| 问题 | 前 3 段章节 | 结果 |',
    '|---|---|---|',
  ];
  for (const result of results) {
    lines.push(`| ${result.question} | ${result.top3.join('<br>') || '—'} | ${result.hit3 ? '通过' : '未通过'} |`);
  }
  const passed = results.filter((result) => result.hit3).length;
  lines.push('', `**通过：${passed}/${results.length}**`, '');
  const outputDir = resolve(__dirname, '../../../docs/knowledge-base/ckd-structure');
  writeFileSync(resolve(outputDir, 'retrieval-evaluation.json'), JSON.stringify(results, null, 2));
  writeFileSync(resolve(outputDir, 'retrieval-evaluation.md'), lines.join('\n'));
  console.log(JSON.stringify({ total: results.length, passed }, null, 2));
  await prisma.$disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
