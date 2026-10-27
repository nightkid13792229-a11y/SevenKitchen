import {
  collapseCandidateNames,
  normalizeCandidateName,
  type CandidateNameRow,
} from '../../../src/domain/nutrition-governance/candidate-name-dedup';

function row(id: string, name: string, sourceType: string): CandidateNameRow {
  return { id, name, sourceType };
}

describe('normalizeCandidateName', () => {
  it('NFKC + 小写，并去掉括号、标点、全角标点与空格', () => {
    expect(
      normalizeCandidateName('  Beef, Ground（Raw）［FDC］、test，x '),
    ).toBe('beefgroundrawfdctestx');
  });

  it('空白名字归一化为空串', () => {
    expect(normalizeCandidateName('')).toBe('');
    expect(normalizeCandidateName(' \t\n　')).toBe('');
  });
});

describe('collapseCandidateNames', () => {
  it('英文名归一化后同名、不同来源：只留一条，alsoIn 列出其它来源', () => {
    const rows = [
      row('cnf-beef', 'Beef, ground, raw', 'CNF'),
      row('usda-beef', 'beef ground raw', 'USDA'),
    ];

    const result = collapseCandidateNames(rows);

    expect(result).toEqual([
      {
        id: 'usda-beef',
        name: 'beef ground raw',
        sourceType: 'USDA',
        alsoIn: ['CNF'],
      },
    ]);
  });

  it('同来源同名也只留一条，且没有 alsoIn（代表取最早那条）', () => {
    const rows = [
      row('usda-first', 'Pork, raw', 'USDA'),
      row('usda-second', 'pork raw', 'USDA'),
    ];

    const result = collapseCandidateNames(rows);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'usda-first',
      name: 'Pork, raw',
      sourceType: 'USDA',
    });
    expect(result[0]).not.toHaveProperty('alsoIn');
  });

  it('不同名字各自成组，保持输入顺序', () => {
    const rows = [row('beef', 'Beef', 'USDA'), row('pork', 'Pork', 'USDA')];

    expect(collapseCandidateNames(rows)).toEqual(rows);
  });

  it('输出顺序 = 每组第一次出现的位置；代表仍按来源优先级选', () => {
    const rows = [
      row('cnf-pork', 'Pork', 'CNF'),
      row('usda-beef', 'Beef', 'USDA'),
      row('usda-pork', 'pork', 'USDA'),
    ];

    const result = collapseCandidateNames(rows);

    // Pork 组第一次出现在 index 0，所以排在最前；代表是 USDA（登记表更早）。
    expect(result.map((entry) => entry.id)).toEqual(['usda-pork', 'usda-beef']);
    expect(result[0]).toMatchObject({
      id: 'usda-pork',
      sourceType: 'USDA',
      alsoIn: ['CNF'],
    });
    expect(result[1]).not.toHaveProperty('alsoIn');
  });

  it('alsoIn 按登记表顺序（不是字母序）排列，且去重', () => {
    const rows = [
      row('tfda-pork', 'Pork', 'TFDA'),
      row('ko-pork', 'PORK', 'KO_RDA'),
      row('cnf-pork', 'pork', 'CNF'),
      row('usda-pork', 'Pork', 'USDA'),
      row('cnf-pork-2', 'PORK', 'CNF'),
    ];

    const result = collapseCandidateNames(rows);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'usda-pork',
      sourceType: 'USDA',
      alsoIn: ['CNF', 'TFDA', 'KO_RDA'],
    });
  });

  it('空归一化名字不参与分组，每条都保留', () => {
    const rows = [
      row('empty-usda', '', 'USDA'),
      row('blank-cnf', '　', 'CNF'),
      row('empty-usda-2', '()', 'USDA'),
      row('pork', 'Pork', 'USDA'),
    ];

    const result = collapseCandidateNames(rows);

    expect(result).toHaveLength(4);
    expect(result.map((entry) => entry.id)).toEqual([
      'empty-usda',
      'blank-cnf',
      'empty-usda-2',
      'pork',
    ]);
    for (const entry of result.slice(0, 3)) {
      expect(entry).not.toHaveProperty('alsoIn');
    }
  });

  it('括号、全半角、标点变体归为同一组', () => {
    const rows = [
      row('a', 'Beef, ground (raw)', 'USDA'),
      row('b', 'BEEF GROUND RAW', 'CNF'),
      row('c', 'ＢＥＥＦ，ＧＲＯＵＮＤ（ＲＡＷ）', 'TFDA'),
    ];

    const result = collapseCandidateNames(rows);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'a',
      name: 'Beef, ground (raw)',
      sourceType: 'USDA',
      alsoIn: ['CNF', 'TFDA'],
    });
  });
});
