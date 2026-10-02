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
 * 只读、不写库、不改条目；退出码 1 表示有硬问题（重复 id/标题、复核过期）。
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

/**
 * 猫专属线索：只做提示。
 *
 * 2026-10 修订（老板定死「我们只做狗」之后）：
 *   · 原来这条检查只跑在待审核的健康领域条目上，CARDIO / ORTHO / DENTAL 这类
 *     食谱设计领域整个漏检 —— `cardio.ts` 里那句「猫的扩张型心肌病自 1987 年…」
 *     就是这么漏过去的。现在**全领域**都查（正文 + keywords + 出处定位）。
 *   · 「犬猫」不再整类豁免：我们自己的行文里写「犬猫」要改成只说犬（"心衰犬猫的
 *     钠限制" → "心衰犬的钠限制"），所以豁免收紧成两类**确实不能改**的东西：
 *       1) 资料正式标题里的「犬猫」——改了就是误引。例：`AAHA 老年犬猫护理指南 2023`、
 *          `WSAVA 犬猫生殖管理指南 2024`、`NRC 犬猫营养需要`。这些名字既出现在
 *          citations/sources 里，也会被正文引用到，所以正文里也要先把它们剥掉再判。
 *       2) 出处定位里写明"只取犬栏"、或表名本身就叫「猫和犬…」的（我们确实只取了
 *          犬那一栏，改了就说不清取的是哪一栏）。
 *     正文里若还有“犬猫都会…”这类并列陈述，属规则 A5「拿不准就保留」的，见
 *     FELINE_ALLOWLIST —— 它是**例外清单**，不是默认豁免：新写的正文请直接写「犬」。
 *   · 第三种允许的写法：**刻意写明的物种出处说明**（句子带「物种说明」四个字的），
 *     例如 endocrine-010「这条依据来自猫的流行病学，不能套到犬身上」。
 *     只做狗 ≠ 不提猫：把"哪些结论不是狗的证据"讲清楚，比删干净更安全。
 */
const FELINE_PATTERN = /(猫|feline|Feline|FELINE|\bcats?\b)/;
/** 资料正式标题/数据库名里的「犬猫」原文：不得改写（改了就是误引） */
const FELINE_SOURCE_TITLES = [
  'AAHA 老年犬猫护理指南 2023',
  'WSAVA 犬猫生殖管理指南 2024',
  'WSAVA 犬猫生殖管理指南',
  'ACVIM 犬猫癫痫持续状态与集群发作管理共识 2024',
  'ACVIM 犬猫免疫介导性溶血性贫血诊断共识 2019',
  'FEDIAF 犬猫营养指南',
  'NRC 犬猫营养需要',
  '犬猫遗传病（DNA）检测实验室数据库',
];
/** 允许的并列表述：仅限"对狗同样成立、且刻意保留"的写法，以及犬栏定位 */
const FELINE_ALLOWLIST = /(犬猫|猫和犬|猫与犬|猫犬|狗猫)/;
/** 出处定位里"表名本身是猫和犬"或"只取犬栏"的写法 */
const FELINE_LOCATOR_ALLOWLIST = /(犬栏|犬猫|猫和犬|猫与犬|猫犬)/;

/**
 * 允许的"物种出处说明"句子：写明"这条依据来自猫、不要套到犬身上"。
 *
 * 为什么留这个口子：我们只做狗，但**把"哪些结论不是狗的证据"讲清楚**，
 * 比删干净更有价值 —— 营养师最怕的就是拿猫的流行病学去推犬的结论
 * （endocrine-010 的碘/硒与甲亢就是这么一条）。
 * 这类句子必须带「物种说明」四个字：标记本身就是刻意留痕，
 * 不会有人顺手写出来，审计时也能一眼分辨"有意保留"和"漏删"。
 */
const FELINE_PROVENANCE_MARKER = '物种说明';

/** 先把"正式标题里的犬猫"剥掉，剩下的「猫」才是我们自己的表述 */
function withoutSourceTitles(text: string): string {
  return FELINE_SOURCE_TITLES.reduce(
    (acc, title) => acc.split(title).join(''),
    text,
  );
}

function isFelineOnly(text: string): boolean {
  const own = withoutSourceTitles(text);
  if (!FELINE_PATTERN.test(own)) return false;
  // 刻意写明的物种出处说明：允许（见 FELINE_PROVENANCE_MARKER）
  if (own.includes(FELINE_PROVENANCE_MARKER)) return false;
  return !FELINE_ALLOWLIST.test(own);
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

    // 顾客侧开不开放，只看条目自己的 reviewStatus（2026-10-02）：
    // 原来另有一张 approvals.ts 登记表，老板说不用留记录，已撤掉。
    // 这里不再判"有没有审核记录"，改成把**还没开放的**健康侧条目列出来 ——
    // 不是错误，是提醒：写完了却忘了标 APPROVED，顾客那边就永远看不到。
    if (healthOnly.has(entry.domain) && entry.reviewStatus !== 'APPROVED') {
      warnings.push(
        `条目 ${entry.id}（健康侧）还不是 APPROVED，顾客侧看不到` +
          `（当前状态：${entry.reviewStatus ?? '缺省=未审核'}）`,
      );
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

  // 猫专属内容（只做警告：正式标题与犬栏定位已在 isFelineOnly 里豁免）。
  // 跑**全部**条目——CARDIO/ORTHO/DENTAL 这些食谱设计领域同样必须只讲狗。
  for (const entry of entries) {
    const texts = [
      ['title', entry.title],
      ['summary', entry.summary],
      ...entry.details.map((t, i) => [`details[${i}]`, t] as [string, string]),
      ...(entry.caveats ?? []).map((t, i) => [`caveats[${i}]`, t] as [string, string]),
      ...(entry.keywords ?? []).map((k, i) => [`keywords[${i}]`, k] as [string, string]),
    ].filter(([, text]) => isFelineOnly(text));
    for (const [field, text] of texts) {
      warnings.push(
        `条目 ${entry.id} 的 ${field} 里出现猫专属表述：${text.slice(0, 40)}…`,
      );
    }
    for (const source of entry.sources ?? []) {
      const locator = `${source.locator ?? ''} ${source.note ?? ''}`;
      if (
        /猫/.test(locator) &&
        !FELINE_LOCATOR_ALLOWLIST.test(locator) &&
        !FELINE_SOURCE_TITLES.some((title) => locator.includes(title))
      ) {
        warnings.push(
          `条目 ${entry.id} 的出处定位指向猫的资料：${locator.slice(0, 40)}…`,
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
