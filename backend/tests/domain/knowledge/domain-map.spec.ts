import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { KNOWLEDGE_DOMAINS } from '../../../src/domain/knowledge/knowledge-domains';

/**
 * 域映射底稿 ↔ 运行时清单（全领域上线计划 Task 1）。
 *
 * `domain-map.json` 是审计底稿（每份文档一个主域 + 可选副域），
 * `knowledge-domains.ts` 是运行时真源。两者一旦分叉，就会出现
 * "签了字但生产查不到"或"生产查到了没签字的文档"——这里把两边钉死。
 */

interface MapEntry {
  id: string;
  sourceId: string | null;
  primaryDomain: string;
  secondaryDomains: string[];
}

interface MapFile {
  totals: { documents: number; domains: number };
  documents: MapEntry[];
}

const REPO_ROOT = resolve(__dirname, '../../../..');
const MAP_PATH = resolve(REPO_ROOT, 'docs/knowledge-base/eval/domain-map.json');

function loadMap(): MapFile {
  return JSON.parse(readFileSync(MAP_PATH, 'utf8')) as MapFile;
}

function membersOf(domainId: string, entries: MapEntry[]): string[] {
  return entries
    .filter(
      (entry) =>
        entry.primaryDomain === domainId ||
        entry.secondaryDomains.includes(domainId),
    )
    .map((entry) => entry.id)
    .sort();
}

describe('domain-map.json', () => {
  const map = loadMap();
  const entries = map.documents;

  it('每份文档恰好一个主域、id 唯一', () => {
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of entries) {
      expect(entry.primaryDomain).toBeTruthy();
      expect(Array.isArray(entry.secondaryDomains)).toBe(true);
      // 主域不应重复出现在副域里
      expect(entry.secondaryDomains).not.toContain(entry.primaryDomain);
    }
  });

  it('totals 与明细一致', () => {
    expect(map.totals.documents).toBe(entries.length);
    expect(map.totals.domains).toBe(KNOWLEDGE_DOMAINS.length);
  });

  it('文档数对齐 source-layer 快照（不写死 159）', () => {
    const snapshot = JSON.parse(
      readFileSync(
        resolve(REPO_ROOT, 'docs/knowledge-base/source-layer/_expected-counts.json'),
        'utf8',
      ),
    ) as { documents: number };
    expect(entries.length).toBe(snapshot.documents);
  });

  it('每个文档的主域都真实存在', () => {
    const known = new Set(KNOWLEDGE_DOMAINS.map((domain) => domain.id as string));
    for (const entry of entries) {
      expect(known.has(entry.primaryDomain)).toBe(true);
      for (const secondary of entry.secondaryDomains) {
        expect(known.has(secondary)).toBe(true);
      }
    }
  });

  it('运行时清单与底稿逐域一致（文档 + 来源）', () => {
    for (const domain of KNOWLEDGE_DOMAINS) {
      const expectedDocuments = membersOf(domain.id, entries);
      expect({
        domain: domain.id,
        documentIds: [...domain.documentIds].sort(),
      }).toEqual({ domain: domain.id, documentIds: expectedDocuments });

      const expectedSources = [
        ...new Set(
          entries
            .filter(
              (entry) =>
                entry.primaryDomain === domain.id ||
                entry.secondaryDomains.includes(domain.id),
            )
            .map((entry) => entry.sourceId)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort();
      expect({
        domain: domain.id,
        sourceIds: [...domain.sourceIds].sort(),
      }).toEqual({ domain: domain.id, sourceIds: expectedSources });
    }
  });
});
