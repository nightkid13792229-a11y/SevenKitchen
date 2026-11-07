import { Injectable } from '@nestjs/common';
import catalog from './data/feed-additive-catalog.json';

/**
 * 《饲料添加剂品种目录》查询。
 *
 * 目录是**只用来查名字**的（选品排序看的是形态/人用/性价比，不看它），
 * 所以这里只回答两件事：这个写法在不在目录里、它的适用范围含不含犬。
 *
 * 数据来自随公告更新的汇总版，生成脚本见 `backend/scripts/build-feed-additive-catalog.mjs`。
 * 目录一年动一两次，做成仓库里的 JSON 比做成表更可控：变更走评审，不用跑迁移。
 */
export interface CatalogEntry {
  name: string;
  category: string;
  /** 公告里的原文适用范围，例如「猪、犬d、猫d」 */
  scope: string;
  dogAllowed: boolean;
}

export interface CatalogMatch extends CatalogEntry {
  /** 完全同名 */
  exact: boolean;
}

interface CatalogFile {
  source: string;
  sourceUrl: string;
  generatedAt: string;
  entries: CatalogEntry[];
}

const DATA = catalog as CatalogFile;

@Injectable()
export class FeedAdditiveCatalogService {
  /** 目录里一共有多少品种、其中多少允许用于犬。界面上用来解释「为什么搜不到」。 */
  getSummary(): {
    total: number;
    dogAllowed: number;
    generatedAt: string;
    source: string;
    sourceUrl: string;
  } {
    return {
      total: DATA.entries.length,
      dogAllowed: DATA.entries.filter((entry) => entry.dogAllowed).length,
      generatedAt: DATA.generatedAt,
      source: DATA.source,
      sourceUrl: DATA.sourceUrl
    };
  }

  /**
   * 按关键词查品种。完全同名的排最前，其次优先「允许用于犬」的。
   * 查不到就返回空——**不猜近似名**，标签印错是要下架的。
   */
  lookup(query: string, limit = 10): CatalogMatch[] {
    const keyword = query.trim();
    if (!keyword) {
      return [];
    }
    const lowered = keyword.toLowerCase();

    const matches = DATA.entries
      .filter((entry) => entry.name.toLowerCase().includes(lowered))
      .map((entry) => ({ ...entry, exact: entry.name === keyword }))
      .sort((a, b) => {
        if (a.exact !== b.exact) {
          return a.exact ? -1 : 1;
        }
        if (a.dogAllowed !== b.dogAllowed) {
          return a.dogAllowed ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
      });

    return matches.slice(0, Math.max(1, limit));
  }

  /** 精确取一条；没有就是没有。 */
  get(name: string): CatalogEntry | null {
    return DATA.entries.find((entry) => entry.name === name) ?? null;
  }
}
