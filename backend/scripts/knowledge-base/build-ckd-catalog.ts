import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  SectionCatalogService,
  type SectionCatalog,
} from '../../src/application/knowledge-base/section-catalog.service';

const CKD_TOPICS = [
  'staging',
  'phosphorus',
  'chloride',
  'magnesium',
  'iron',
  'zinc',
  'iodine',
  'copper',
  'protein',
  'proteinuria',
  'bloodpressure',
  'sodium',
  'potassium',
  'omega3',
  'calcium',
  'vitaminD',
  'energy',
  'water',
  'phosphatebinder',
  'fiber',
  'anemia',
];

function topicLabel(topic: string): string {
  const labels: Record<string, string> = {
    staging: '分期/亚分期',
    phosphorus: '磷',
    chloride: '氯',
    magnesium: '镁',
    iron: '铁',
    zinc: '锌',
    iodine: '碘',
    copper: '铜',
    protein: '蛋白',
    proteinuria: '蛋白尿/UPC',
    bloodpressure: '血压',
    sodium: '钠',
    potassium: '钾',
    omega3: 'omega-3',
    calcium: '钙',
    vitaminD: '维生素 D',
    energy: '能量',
    water: '水',
    phosphatebinder: '磷结合剂',
    fiber: '纤维',
    anemia: '贫血',
  };
  return labels[topic] ?? topic;
}

function renderMarkdown(catalog: SectionCatalog): string {
  const lines: string[] = [];
  lines.push('# CKD 章节结构目录（自动生成）');
  lines.push('');
  lines.push('> 由 `backend/scripts/knowledge-base/build-ckd-catalog.ts` 从 source layer 生成；不写结论，只列目录与元数据。');
  lines.push('');
  lines.push('## 文档');
  lines.push('');
  lines.push('| 文档 | 类型 | 权威性 | 物种 | 分期 | 章节 | 段落 |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const doc of catalog.documents) {
    lines.push(
      `| ${doc.title} | ${doc.documentType} | ${doc.authority} | ${doc.species} | ${doc.stages.join(',') || '—'} | ${doc.sectionCount} | ${doc.paragraphCount} |`,
    );
  }
  lines.push('');
  lines.push('## 章节');
  lines.push('');
  lines.push('| 文档 | 页码 | 章节 | 类型 | 物种 | 分期 | 主题 | 段落 |');
  lines.push('|---|---:|---|---|---|---|---|---:|');
  for (const section of catalog.sections) {
    lines.push(
      `| ${section.sourceId ?? section.documentId} | ${section.pageNo ?? '—'} | ${section.title.replace(/\|/g, '\\|')} | ${section.sectionType} | ${section.species} | ${section.stages.join(',') || '—'} | ${section.topics.map(topicLabel).join('、') || '—'} | ${section.paragraphCount} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function renderCoverage(catalog: SectionCatalog): string {
  const lines: string[] = [];
  lines.push('# CKD 主题覆盖地图（自动生成）');
  lines.push('');
  lines.push('> 只统计章节标题/正文中出现的主题，不代表该主题在临床上充分或正确；用于看“有没有来源、去哪找”。');
  lines.push('');
  lines.push('| 主题 | 覆盖文档数 | 覆盖章节数 | 文档 |');
  lines.push('|---|---:|---:|---|');
  for (const topic of CKD_TOPICS) {
    const sections = catalog.sections.filter((section) =>
      (section.allTopics ?? section.topics).includes(topic),
    );
    const documents = new Set(sections.map((section) => section.documentId));
    lines.push(
      `| ${topicLabel(topic)} | ${documents.size} | ${sections.length} | ${[...documents].join('、') || '—'} |`,
    );
  }
  lines.push('');
  const missing = CKD_TOPICS.filter(
    (topic) => !catalog.sections.some((section) => (section.allTopics ?? section.topics).includes(topic)),
  );
  lines.push('## 未覆盖主题');
  lines.push('');
  lines.push(missing.length > 0 ? missing.map(topicLabel).join('、') : '无');
  lines.push('');
  return lines.join('\n');
}

(async () => {
  const prisma = new PrismaClient();
  const service = new SectionCatalogService(prisma as any);
  const catalog = await service.buildCkd();
  const dir = resolve(__dirname, '../../../docs/knowledge-base/ckd-structure');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'section-catalog.json'), JSON.stringify(catalog, null, 2));
  writeFileSync(resolve(dir, 'section-catalog.md'), renderMarkdown(catalog));
  writeFileSync(resolve(dir, 'coverage-map.md'), renderCoverage(catalog));
  console.log(
    JSON.stringify({
      documents: catalog.documents.length,
      sections: catalog.sections.length,
      paragraphs: catalog.documents.reduce((sum, doc) => sum + doc.paragraphCount, 0),
    }),
  );
  await prisma.$disconnect();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
