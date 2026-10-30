import { LOCAL_LIBRARY_SOURCE_TYPES } from './nutrition-source-registry';

/**
 * 候选词条名折叠：同一个归一化名字只出一条，附 `alsoIn` 告诉调用方
 * 还有哪些来源库有同名记录。
 *
 * 只做纯函数，不查库、不读写文件；候选检索与审计脚本共用同一套规则。
 */

export interface CandidateNameRow {
  id: string;
  name: string;
  sourceType: string;
  alsoIn?: string[];
}

/**
 * 登记表顺序 = 代表来源与 `alsoIn` 的排序依据。
 * 不在登记表里的 sourceType（例如测试构造的未知来源）排在最后，再按字母序。
 */
const SOURCE_ORDER: ReadonlyMap<string, number> = new Map(
  LOCAL_LIBRARY_SOURCE_TYPES.map((sourceType, index) => [sourceType, index]),
);

/** NFKC 之后还要去掉的括号 / 标点；全角变体一并列上，避免依赖 NFKC 细节。 */
const STRIPPED_CHARACTERS = /[\s[\]［］()（）、，,]/gu;

/**
 * 归一化词条名：NFKC → 小写 → 去掉括号、标点、空格。
 *
 * 不猜生熟状态、不删部位词：只把「同名的排版差异」抹平。
 */
export function normalizeCandidateName(raw: string): string {
  return raw.normalize('NFKC').toLowerCase().replace(STRIPPED_CHARACTERS, '');
}

function sourceRank(sourceType: string): number {
  return SOURCE_ORDER.get(sourceType) ?? SOURCE_ORDER.size;
}

/** 登记表顺序优先；未知来源之间按字母序，保证结果稳定。 */
function compareSourceTypes(left: string, right: string): number {
  const rankDelta = sourceRank(left) - sourceRank(right);
  return rankDelta !== 0 ? rankDelta : left.localeCompare(right);
}

interface NameGroup {
  rows: CandidateNameRow[];
}

/**
 * 同归一化名字折叠成一条。
 *
 * - 代表行：来源在 `LOCAL_LIBRARY_SOURCE_TYPES` 里更靠前；同来源取更早的输入行；
 * - `alsoIn`：组内其它来源，按登记表顺序、去重；没有其它来源时不输出该字段；
 * - 输出顺序：每组第一次出现的位置；
 * - 归一化后为空的名字不参与分组，每条都保留（否则空名字会互相「去重」）。
 */
export function collapseCandidateNames(
  rows: readonly CandidateNameRow[],
): CandidateNameRow[] {
  const groups: NameGroup[] = [];
  const groupByNormalizedName = new Map<string, NameGroup>();

  for (const row of rows) {
    const normalized = normalizeCandidateName(row.name);
    if (normalized !== '') {
      const existing = groupByNormalizedName.get(normalized);
      if (existing) {
        existing.rows.push(row);
        continue;
      }
    }

    const group: NameGroup = { rows: [row] };
    // 空名字不进索引：每条空名字记录自成一组，不会互相合并。
    if (normalized !== '') {
      groupByNormalizedName.set(normalized, group);
    }
    groups.push(group);
  }

  // groups 的插入顺序就是每组第一次出现的顺序。
  return groups.map((group) => {
    let representativeIndex = 0;
    for (let index = 1; index < group.rows.length; index += 1) {
      const candidate = group.rows[index];
      const current = group.rows[representativeIndex];
      const rankDelta =
        sourceRank(candidate.sourceType) - sourceRank(current.sourceType);
      // 同来源不替换：group.rows 按输入顺序排列，先出现的就是 tie-break 赢家。
      if (rankDelta < 0) {
        representativeIndex = index;
      }
    }

    const representative = group.rows[representativeIndex];
    const otherSourceTypes = [
      ...new Set(group.rows.map((row) => row.sourceType)),
    ]
      .filter((sourceType) => sourceType !== representative.sourceType)
      .sort(compareSourceTypes);

    // 只返回约定的三列（+ alsoIn），不把调用方传进来的临时字段带出去。
    return otherSourceTypes.length > 0
      ? {
          id: representative.id,
          name: representative.name,
          sourceType: representative.sourceType,
          alsoIn: otherSourceTypes,
        }
      : {
          id: representative.id,
          name: representative.name,
          sourceType: representative.sourceType,
        };
  });
}
