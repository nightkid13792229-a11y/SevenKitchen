import { Injectable } from '@nestjs/common';
import catalog from './data/feed-material-catalog.json';

/**
 * 《饲料原料目录》查询。
 *
 * 和《饲料添加剂品种目录》分工不同：判断一个物质该按「饲料原料」还是
 * 「饲料添加剂」标，先看它落在哪本目录里。
 *
 * 数据来源：农业农村部第 1773 号公告及后续修订汇总（截至 2025-06）。
 */

export interface MaterialEntry {
  code: string;
  name: string;
  category: string;
  subCategory: string;
  description: string;
  mandatoryLabel: string;
}

export interface MaterialMatch extends MaterialEntry {
  exact: boolean;
}

interface CatalogFile {
  source: string;
  sourceUrl: string;
  generatedAt: string;
  entries: MaterialEntry[];
}

const DATA = catalog as CatalogFile;

@Injectable()
export class FeedMaterialCatalogService {
  getSummary(): { total: number; generatedAt: string; source: string; sourceUrl: string } {
    return {
      total: DATA.entries.length,
      generatedAt: DATA.generatedAt,
      source: DATA.source,
      sourceUrl: DATA.sourceUrl
    };
  }

  /** 按名字查（包含匹配，完全同名排最前）。查不到就返回空，不猜近似名。 */
  lookup(query: string, limit = 10): MaterialMatch[] {
    const keyword = String(query ?? '').trim();
    if (!keyword) {
      return [];
    }
    return DATA.entries
      .filter((entry) => entry.name.includes(keyword))
      .map((entry) => ({ ...entry, exact: entry.name === keyword }))
      .sort((a, b) => {
        if (a.exact !== b.exact) {
          return a.exact ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
      })
      .slice(0, Math.max(1, limit));
  }

  /** 在一段文字里找目录里出现过的原料名（用于从标签原文认「这是鱼油」）。 */
  findMentioned(text: string, limit = 10): MaterialEntry[] {
    const source = String(text ?? '');
    if (!source) {
      return [];
    }
    const hits = DATA.entries.filter(
      (entry) => entry.name.length >= 2 && source.includes(entry.name)
    );
    // 长的名字优先（「鱼油」和「鱿鱼油」同时命中时，按原文里出现的那条算）
    return hits.sort((a, b) => b.name.length - a.name.length).slice(0, Math.max(1, limit));
  }

  /** 全部规范名（给模型自己翻译、自己匹配用） */
  listNames(): string[] {
    return DATA.entries.map((entry) => entry.name);
  }

  get(name: string): MaterialEntry | null {
    return DATA.entries.find((entry) => entry.name === name) ?? null;
  }
}
