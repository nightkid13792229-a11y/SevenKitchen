import * as fs from 'fs';
import * as path from 'path';

/**
 * 出处锚定的回归闸。
 *
 * 锁的是"数据性质"，不是某条内容：只要有人删了锚点、或改了条目 ID 却没重跑锚定，
 * 这里就会红。数据源是 docs/knowledge-base/citation-anchors.json（锚定脚本的产物）。
 */
const ANCHORS = path.resolve(__dirname, '../../../../docs/knowledge-base/citation-anchors.json');
const DATA_DIR = path.resolve(__dirname, '../../../src/domain/recipe-designer/knowledge-base/data');

describe('出处锚定回归', () => {
  const anchors = JSON.parse(fs.readFileSync(ANCHORS, 'utf8')).filter(
    (a: any) => a.confidence,
  );

  it('每个条目至少有一条出处带段落 ID', () => {
    const byEntry = new Map<string, any[]>();
    for (const a of anchors) {
      byEntry.set(a.entry, [...(byEntry.get(a.entry) ?? []), a]);
    }
    const broken = [...byEntry.entries()]
      .filter(([, list]) => !list.some((x) => (x.paragraphs ?? []).length > 0))
      .map(([entry]) => entry);
    expect(broken).toEqual([]);
  });

  it('锚点引用的段落 ID 都符合 docId-pNNNN 格式', () => {
    const bad = anchors
      .flatMap((a: any) => a.paragraphs ?? [])
      .filter((id: string) => !/^[A-Za-z0-9\u4e00-\u9fff-]+-p\d{5}(-\d+)?$/.test(id));
    expect(bad).toEqual([]);
  });

  it('锚点里的条目 ID 在代码里都存在', () => {
    const ids = new Set<string>();
    for (const f of fs.readdirSync(DATA_DIR).filter((x) => x.endsWith('.ts'))) {
      const raw = fs.readFileSync(path.join(DATA_DIR, f), 'utf8');
      for (const m of raw.matchAll(/id: '([a-z]+-\d+)'/g)) ids.add(m[1]);
    }
    const orphan = [...new Set(anchors.map((a: any) => a.entry))].filter(
      (e) => !ids.has(e as string),
    );
    expect(orphan).toEqual([]);
  });

  it('表格映射里的表 ID 都真实存在', () => {
    const map = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../../../docs/knowledge-base/table-entry-map.json'),
        'utf8',
      ),
    );
    const tablesDir = path.resolve(__dirname, '../../../../docs/knowledge-base/tables');
    const missing = Object.keys(map.tableToEntries).filter(
      (t) => !fs.existsSync(path.join(tablesDir, `${t}.json`)),
    );
    expect(missing).toEqual([]);
  });
});
