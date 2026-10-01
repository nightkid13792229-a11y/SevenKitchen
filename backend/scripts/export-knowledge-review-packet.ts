/**
 * 导出「健康知识审核包」——给合作兽医审阅用。
 *
 * 为什么需要它：
 *   健康管理的全部知识条目都是 `PENDING_REVIEW`，老板定的边界是**没人审过就不给顾客看**。
 *   所以现在最卡脖子的不是"能不能做"，而是"兽医什么时候能审完"。
 *   把条目从代码里导出成一份能打印、能打勾、能写意见的文档，审核成本才降得下来。
 *
 * 产出（默认写到 `docs/knowledge-base/review-packet/`）：
 *   · `健康知识审核包-<日期>.md`   给人读：按领域分节，每条留「□ 通过 □ 需修改 □ 删除」与意见栏
 *   · `健康知识审核包-<日期>.csv`  给表格：一行一条，便于筛选、排序、批量回填
 *
 * 用法：
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/export-knowledge-review-packet.ts
 *   可选参数：--out <目录>   --date <YYYY-MM-DD>
 *
 * 注意：本脚本**只读**知识库、只写文档，不碰数据库、不改任何条目状态。
 *       审核结论要回填到代码里的 `reviewStatus`，仍走 docs/knowledge-base/intake-sop.md 的流程。
 */
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  KnowledgeBaseService,
  resolveEvidenceStrength,
} from '../src/application/recipe-designer/knowledge-base.service';
import {
  KNOWLEDGE_DOMAIN_LABELS,
  KNOWLEDGE_QUESTION_TYPE_LABELS,
  KNOWLEDGE_URGENCY_LABELS,
  HEALTH_ONLY_DOMAINS,
  type KnowledgeEntry,
} from '../src/domain/recipe-designer/knowledge-base/types';
import { KNOWLEDGE_SOURCES } from '../src/domain/recipe-designer/knowledge-base/source-registry';

const RISK_LABELS: Record<string, string> = {
  HIGH: '高（写错会延误或伤人）',
  MEDIUM: '中',
  LOW: '低',
};

const EVIDENCE_LABELS: Record<string, string> = {
  SINGLE_SOURCE: '单一来源',
  TWO_SOURCES: '两个机构互相印证',
  MULTI_SOURCE: '三个以上机构',
  CONFLICT: '来源之间存在冲突（需裁决）',
};

function parseArgs(argv: string[]) {
  const outIndex = argv.indexOf('--out');
  const dateIndex = argv.indexOf('--date');
  const today = new Date().toISOString().slice(0, 10);
  return {
    // 默认写到仓库根的 docs（不是 backend/docs）：这份文档是给人看的治理产物
    outDir:
      outIndex >= 0
        ? resolve(process.cwd(), argv[outIndex + 1])
        : resolve(__dirname, '../../docs/knowledge-base/review-packet'),
    date: dateIndex >= 0 ? argv[dateIndex + 1] : today,
  };
}

export function sourceDisplayName(sourceId: string): string {
  const record = KNOWLEDGE_SOURCES.find((item) => item.id === sourceId);
  if (!record) return sourceId;
  return `${record.name}（${record.version}｜证据级 ${record.tier}）`;
}

export function healthEntriesOf(service: KnowledgeBaseService): KnowledgeEntry[] {
  const healthOnly = new Set<string>(HEALTH_ONLY_DOMAINS);
  return service
    .getAll()
    .filter((entry) => healthOnly.has(entry.domain));
}

export function buildMarkdown(entries: KnowledgeEntry[], date: string): string {
  const byDomain = new Map<string, KnowledgeEntry[]>();
  for (const entry of entries) {
    const list = byDomain.get(entry.domain) ?? [];
    list.push(entry);
    byDomain.set(entry.domain, list);
  }

  const lines: string[] = [];
  lines.push('# 健康知识审核包（待合作兽医审核）');
  lines.push('');
  lines.push(`**导出日期**：${date}`);
  lines.push(`**条目总数**：${entries.length} 条`);
  lines.push('');
  lines.push('## 怎么用这份文档');
  lines.push('');
  lines.push('1. 每条知识后面有四个勾选框：**通过 / 需修改 / 删除 / 拿不准**，请在其中一个上打勾（或写字母）；');
  lines.push('2. 有意见写在「意见」那一行，写多写少都行，**只要指得出问题就够**；');
  lines.push('3. 重点看三类条目：**风险等级为高**、**分诊类（要不要去医院）**、**证据强度为单一来源**；');
  lines.push('4. 审完把这份文档交回，我们按结论改内容，或把条目标为「已审核」。');
  lines.push('');
  lines.push('> **边界说明（重要）**：这批条目**目前对顾客完全不可见**（全部是待审核状态）。');
  lines.push('> 只有标注「已审核」的条目才会进入面向顾客的 AI 输出。');
  lines.push('> 另外：条目不写化验参考区间（区间以顾客手上的报告为准）、不给诊断、不给药名与剂量。');
  lines.push('');
  lines.push('## 审核优先级建议');
  lines.push('');
  const highRisk = entries.filter((entry) => entry.riskLevel === 'HIGH').length;
  const triage = entries.filter((entry) => entry.questionType === 'TRIAGE').length;
  const single = entries.filter(
    (entry) => resolveEvidenceStrength(entry) === 'SINGLE_SOURCE',
  ).length;
  lines.push(`- 风险等级「高」：**${highRisk} 条**`);
  lines.push(`- 分诊类（回答"要不要去医院"）：**${triage} 条**`);
  lines.push(`- 单一来源：**${single} 条**`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const [domain, list] of byDomain) {
    const label = KNOWLEDGE_DOMAIN_LABELS[domain as keyof typeof KNOWLEDGE_DOMAIN_LABELS] ?? domain;
    lines.push(`## ${label}（${domain}）· ${list.length} 条`);
    lines.push('');
    for (const entry of list) {
      lines.push(`### ${entry.id}　${entry.title}`);
      lines.push('');
      lines.push(`- **分类**：${KNOWLEDGE_QUESTION_TYPE_LABELS[entry.questionType as keyof typeof KNOWLEDGE_QUESTION_TYPE_LABELS] ?? entry.questionType ?? '—'}`);
      lines.push(`- **风险等级**：${RISK_LABELS[entry.riskLevel ?? ''] ?? entry.riskLevel ?? '—'}`);
      if (entry.urgency) {
        lines.push(`- **紧急程度**：${KNOWLEDGE_URGENCY_LABELS[entry.urgency] ?? entry.urgency}`);
      }
      lines.push(`- **证据强度**：${EVIDENCE_LABELS[resolveEvidenceStrength(entry)] ?? '—'}`);
      lines.push(`- **适用标签**：${entry.applicableTo.join('、')}`);
      lines.push(`- **检索关键词**：${entry.keywords.join('、')}`);
      lines.push(`- **下次复核**：${entry.reviewBy ?? '—'}`);
      lines.push('');
      lines.push(`**结论**：${entry.summary}`);
      lines.push('');
      if (entry.details.length > 0) {
        lines.push('**要点**：');
        lines.push('');
        for (const detail of entry.details) {
          lines.push(`- ${detail}`);
        }
        lines.push('');
      }
      if (entry.caveats && entry.caveats.length > 0) {
        lines.push('**注意事项**：');
        lines.push('');
        for (const caveat of entry.caveats) {
          lines.push(`- ${caveat}`);
        }
        lines.push('');
      }
      lines.push('**出处**：');
      lines.push('');
      for (const source of entry.sources ?? []) {
        lines.push(
          `- ${sourceDisplayName(source.sourceId)}　→ ${source.locator}${
            source.note ? `（${source.note}）` : ''
          }`,
        );
      }
      lines.push('');
      lines.push('**审核结论**：　□ 通过　　□ 需修改　　□ 删除　　□ 拿不准');
      lines.push('');
      lines.push('**意见**：');
      lines.push('');
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

function csvCell(value: string): string {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
}

export function buildCsv(entries: KnowledgeEntry[]): string {
  const header = [
    '领域',
    '编号',
    '标题',
    '分类',
    '风险等级',
    '紧急程度',
    '证据强度',
    '来源机构数',
    '来源',
    '定位',
    '结论',
    '要点数',
    '注意事项数',
    '当前审核状态',
    '审核结论（请填）',
    '审核意见（请填）',
  ];
  const rows: string[] = [header.map(csvCell).join(',')];

  for (const entry of entries) {
    const label =
      KNOWLEDGE_DOMAIN_LABELS[entry.domain as keyof typeof KNOWLEDGE_DOMAIN_LABELS] ??
      entry.domain;
    const sources = entry.sources ?? [];
    rows.push(
      [
        label,
        entry.id,
        entry.title,
        KNOWLEDGE_QUESTION_TYPE_LABELS[entry.questionType as keyof typeof KNOWLEDGE_QUESTION_TYPE_LABELS] ?? entry.questionType ?? '',
        RISK_LABELS[entry.riskLevel ?? ''] ?? entry.riskLevel ?? '',
        entry.urgency ? KNOWLEDGE_URGENCY_LABELS[entry.urgency] ?? entry.urgency : '',
        EVIDENCE_LABELS[resolveEvidenceStrength(entry)] ?? '',
        String(
          new Set(sources.map((source) => source.sourceId)).size,
        ),
        sources.map((source) => source.sourceId).join(' / '),
        sources.map((source) => source.locator).join(' / '),
        entry.summary.replace(/\*\*/g, ''),
        String(entry.details.length),
        String((entry.caveats ?? []).length),
        entry.reviewStatus ?? '（未标注=未审核）',
        '',
        '',
      ]
        .map(csvCell)
        .join(','),
    );
  }

  // 带 BOM，Excel 打开中文不乱码
  return `\uFEFF${rows.join('\n')}\n`;
}

function main() {
  const { outDir, date } = parseArgs(process.argv.slice(2));
  const service = new KnowledgeBaseService();
  const entries = healthEntriesOf(service);

  const absoluteOut = outDir;
  mkdirSync(absoluteOut, { recursive: true });

  const markdownPath = resolve(absoluteOut, `健康知识审核包-${date}.md`);
  const csvPath = resolve(absoluteOut, `健康知识审核包-${date}.csv`);
  writeFileSync(markdownPath, buildMarkdown(entries, date), 'utf8');
  writeFileSync(csvPath, buildCsv(entries), 'utf8');

  const byDomain = new Map<string, number>();
  for (const entry of entries) {
    byDomain.set(entry.domain, (byDomain.get(entry.domain) ?? 0) + 1);
  }

  console.log(`健康知识审核包已导出：${entries.length} 条`);
  for (const [domain, count] of byDomain) {
    console.log(`  ${domain}: ${count} 条`);
  }
  console.log(`  Markdown: ${markdownPath}`);
  console.log(`  CSV:      ${csvPath}`);
}

if (require.main === module) {
  main();
}
