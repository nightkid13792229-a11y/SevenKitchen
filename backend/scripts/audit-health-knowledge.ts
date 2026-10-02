/**
 * 健康知识条目 · 入库前自检（结构校验之外的那些事）。
 *
 * 启动时的 `KnowledgeBaseService` 校验管的是**结构**：id 唯一、标签在词表内、
 * 出处已登记、高风险要两个机构、分诊要写紧急程度。
 * 但结构全对的内容仍可能是"不能给家长看"的：
 *   · 写重复了同一件事（两条标题不同、讲的是一回事，检索时会互相挤名额）
 *   · 引了猫的资料（**我们只做狗**，审计已把猫专属内容列为无效内容）
 *   · citations 里写的出处名，在来源登记表里找不到对应文档（人看的名字对不上号）
 *   · 复核日期已经过去（= 这条知识其实过期了，但没人发现）
 *
 * 这个脚本把这些**内容层面**的问题一次列出来，供人工判断。
 * 只读、不写库、不改条目；退出码 1 表示有硬问题（重复 id/标题、复核过期、待审核领域里混进已审核）。
 *
 * 用法：
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/audit-health-knowledge.ts
 *   可选：--json 输出机器可读结果
 */
import { KnowledgeBaseService } from '../src/application/recipe-designer/knowledge-base.service';
import {
  HEALTH_ONLY_DOMAINS,
  type KnowledgeEntry,
} from '../src/domain/recipe-designer/knowledge-base/types';
import { isKnowledgeEntryApproved } from '../src/domain/recipe-designer/knowledge-base/approvals';
import { KNOWLEDGE_SOURCES } from '../src/domain/recipe-designer/knowledge-base/source-registry';

export interface HealthKnowledgeAudit {
  total: number;
  byDomain: Record<string, number>;
  byUrgency: Record<string, number>;
  byRisk: Record<string, number>;
  byEvidence: Record<string, number>;
  problems: string[];
  warnings: string[];
}

/** 猫专属线索：只做提示，人名/标题里的"犬猫并列共识"由人判断 */
const FELINE_PATTERN = /(猫|feline|Feline|FELINE)/;
/** 允许的并列表述（这些不算猫专属内容） */
const FELINE_ALLOWLIST = /(犬猫|猫和犬|猫与犬|狗和猫)/;

function isFelineOnly(text: string): boolean {
  if (!FELINE_PATTERN.test(text)) return false;
  return !FELINE_ALLOWLIST.test(text);
}

/**
 * 出处名比对：只比中文核心词。
 *
 * 为什么要这么麻烦：`citations[].source` 是给人看的自由文本（"AAHA 2019 犬生命阶段指南"），
 * 登记表里的 `name` 是规范名（"AAHA 犬生命阶段指南"），差别只在年份与括号注解。
 * 直接字符串包含会误报一大片，于是两边都抽掉年份、拉丁字母与标点，只留中文再比。
 */
function cjkCore(text: string): string {
  return text.replace(/[^\u4e00-\u9fa5]/g, '');
}

function sharesCore(a: string, b: string, min = 5): boolean {
  const ca = cjkCore(a);
  const cb = cjkCore(b);
  if (!ca || !cb) return false;
  if (ca.includes(cb) || cb.includes(ca)) return true;
  for (let i = 0; i + min <= ca.length; i += 1) {
    if (cb.includes(ca.slice(i, i + min))) return true;
  }
  return false;
}

export function auditHealthKnowledge(
  entries: KnowledgeEntry[],
  options: { today?: string } = {},
): HealthKnowledgeAudit {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const healthOnly = new Set<string>(HEALTH_ONLY_DOMAINS);
  const health = entries.filter((entry) => healthOnly.has(entry.domain));

  const byDomain: Record<string, number> = {};
  const byUrgency: Record<string, number> = {};
  const byRisk: Record<string, number> = {};
  const byEvidence: Record<string, number> = {};
  const problems: string[] = [];
  const warnings: string[] = [];

  // 标题重复：不同 id 讲同一件事，检索时会互相挤名额
  const titleIndex = new Map<string, string[]>();
  const idIndex = new Map<string, number>();

  for (const entry of health) {
    byDomain[entry.domain] = (byDomain[entry.domain] ?? 0) + 1;
    byUrgency[entry.urgency ?? '（无）'] =
      (byUrgency[entry.urgency ?? '（无）'] ?? 0) + 1;
    byRisk[entry.riskLevel ?? '（无）'] =
      (byRisk[entry.riskLevel ?? '（无）'] ?? 0) + 1;
    const orgs = new Set(
      (entry.sources ?? []).map((source) => source.sourceId),
    );
    const evidenceKey =
      orgs.size >= 3
        ? 'MULTI_SOURCE'
        : orgs.size === 2
          ? 'TWO_SOURCES'
          : 'SINGLE_SOURCE';
    byEvidence[evidenceKey] = (byEvidence[evidenceKey] ?? 0) + 1;

    idIndex.set(entry.id, (idIndex.get(entry.id) ?? 0) + 1);
    const normalizedTitle = entry.title.replace(/\s/g, '');
    titleIndex.set(normalizedTitle, [
      ...(titleIndex.get(normalizedTitle) ?? []),
      entry.id,
    ]);

    // 复核过期 = 这条知识该重新核了，但没人在看
    if (entry.reviewBy && entry.reviewBy < today) {
      problems.push(`条目 ${entry.id} 的复核日期已过（${entry.reviewBy}）`);
    }

    // 待审核领域里混进 APPROVED：老板定的边界，没人审过不许标已审核。
    // 2026-10-02：审核结论以 approvals.ts 那张登记表为准（由兽医填的 CSV 回填生成），
    // 只标了 reviewStatus、登记表里却没有的，仍然算"没有审核记录"。
    if (
      entry.reviewStatus === 'APPROVED' &&
      healthOnly.has(entry.domain) &&
      !isKnowledgeEntryApproved(entry.id)
    ) {
      problems.push(
        `条目 ${entry.id} 是健康侧条目却标成 APPROVED —— 必须有审核记录才能标已审核`,
      );
    }

    // 猫专属内容（只做警告：需要人判断是不是"犬猫并列共识"的正式标题）
    const texts = [
      entry.title,
      entry.summary,
      ...entry.details,
      ...(entry.caveats ?? []),
    ].filter(isFelineOnly);
    if (texts.length > 0) {
      warnings.push(
        `条目 ${entry.id} 正文里出现猫专属表述：${texts[0].slice(0, 40)}…`,
      );
    }
    for (const source of entry.sources ?? []) {
      const locator = `${source.locator ?? ''} ${source.note ?? ''}`;
      if (/猫/.test(locator) && !FELINE_ALLOWLIST.test(locator)) {
        warnings.push(
          `条目 ${entry.id} 的出处定位指向猫的资料：${locator.slice(0, 40)}…`,
        );
      }
    }

    // citations 里的出处名要能对上号：要么对得上登记表的规范名，
    // 要么对得上**本条自己**的 sources.locator（ACVIM 这类"一套 23 份共识"的
    // 打包来源，规范名比具体共识标题更粗，只能用 locator 比）
    const ownLocators = (entry.sources ?? []).flatMap((source) => [
      source.locator ?? '',
      source.note ?? '',
    ]);
    for (const citation of entry.citations) {
      const matched =
        KNOWLEDGE_SOURCES.some((source) =>
          sharesCore(citation.source, source.name),
        ) ||
        ownLocators.some((locator) => sharesCore(citation.source, locator));
      if (!matched) {
        warnings.push(
          `条目 ${entry.id} 的出处名"${citation.source}"既对不上来源登记表，` +
            '也对不上本条 sources 的定位',
        );
      }
    }
  }

  for (const [title, ids] of titleIndex) {
    if (ids.length > 1) {
      problems.push(`标题重复：${ids.join('、')} 都叫"${title}"`);
    }
  }
  for (const [id, count] of idIndex) {
    if (count > 1) {
      problems.push(`条目 id 重复：${id}（${count} 次）`);
    }
  }

  return {
    total: health.length,
    byDomain,
    byUrgency,
    byRisk,
    byEvidence,
    problems,
    warnings,
  };
}

function main() {
  const service = new KnowledgeBaseService();
  const result = auditHealthKnowledge(service.getAll());

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`健康知识条目：${result.total} 条`);
    console.log('  按领域：', result.byDomain);
    console.log('  按风险：', result.byRisk);
    console.log('  按紧急程度：', result.byUrgency);
    console.log('  按证据强度：', result.byEvidence);
    console.log(`\n硬问题（${result.problems.length}）：`);
    for (const problem of result.problems) console.log(`  ✗ ${problem}`);
    console.log(`\n待人工判断（${result.warnings.length}）：`);
    for (const warning of result.warnings) console.log(`  ! ${warning}`);
  }

  if (result.problems.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
